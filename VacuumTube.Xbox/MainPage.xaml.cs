using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using VacuumTube.Xbox.Services;
using Windows.Security.ExchangeActiveSyncProvisioning;
using Windows.Storage;
using Windows.Storage.Streams;
using Windows.System;
using Windows.System.Profile;
using Windows.UI.Core;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;

namespace VacuumTube.Xbox
{
    public sealed partial class MainPage : Page
    {
        private const string YouTubeUrl = "https://www.youtube.com/tv";
        private const string ClientUserAgent = "Mozilla/5.0 (PS4; Leanback Shell) Cobalt/19.lts.0-qa; compatible; VacuumTube-Xbox/1.8.1";
        private const string NetworkUserAgent = "Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.40.1035033; compatible; VacuumTube-Xbox/1.8.1";
        private const string GenericUserAgent = "VacuumTube-Xbox/1.8.1";
        private static readonly HashSet<string> ProxyHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "sponsor.ajay.app",
            "dearrow.ajay.app",
            "dearrow-thumb.ajay.app",
            "returnyoutubedislikeapi.com"
        };

        private readonly ConfigStore _config = new ConfigStore();
        private readonly MicrophonePermissionService _microphone = new MicrophonePermissionService();
        private XboxGamepadBridge _gamepads;
        private DialService _dial;
        private CspResponseInterceptor _csp;
        private bool _ready;
        private bool _initializing;
        private bool _webViewConfigured;
        private bool _scriptRegistered;
        private bool _activationHooked;
        private bool _isFocused = true;
        private bool _suspended;
        private bool _webViewSuspended;

        public MainPage()
        {
#if DEBUG
            // Required by Microsoft for remote Edge DevTools inspection of Xbox UWP WebView2.
            // It must be set before EnsureCoreWebView2Async creates the browser instance.
            Environment.SetEnvironmentVariable(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--enable-features=msEdgeDevToolsWdpRemoteDebugging");
#endif
            InitializeComponent();
            Loaded += OnLoaded;
            Unloaded += OnUnloaded;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            await InitializeAsync();
        }

        private async void OnRetryClicked(object sender, RoutedEventArgs e)
        {
            await InitializeAsync();
        }

        private async Task InitializeAsync()
        {
            if (_ready || _initializing) return;

            _initializing = true;
            StartupOverlay.Visibility = Visibility.Visible;
            StartupProgress.IsActive = true;
            StartupProgress.Visibility = Visibility.Visible;
            RetryButton.Visibility = Visibility.Collapsed;
            StartupStatus.Text = "WebView2 wird initialisiert …";

            try
            {
                ApplicationView.PreferredLaunchWindowingMode = ApplicationViewWindowingMode.FullScreen;
                ApplicationView.GetForCurrentView().TryEnterFullScreenMode();
                if (!_activationHooked)
                {
                    Window.Current.CoreWindow.Activated += OnWindowActivated;
                    _activationHooked = true;
                }

                await Browser.EnsureCoreWebView2Async();
                if (!_webViewConfigured)
                {
                    ConfigureWebView();
                    _webViewConfigured = true;
                }

                if (!_scriptRegistered)
                {
                    var bundle = await ReadAppTextAsync("ms-appx:///Web/vacuumtube.bundle.js");
                    var platform = GetPlatformInfo();
                    platform["webViewVersion"] = Browser.CoreWebView2.Environment.BrowserVersionString;
                    var bootstrap = "window.__VACUUMTUBE_BOOTSTRAP_CONFIG__=" + _config.Current.ToString(Formatting.None) + ";" +
                                    "window.__VACUUMTUBE_PLATFORM__=" + platform.ToString(Formatting.None) + ";\n" + bundle;
                    await Browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(bootstrap);
                    _scriptRegistered = true;
                }

                if (_csp == null)
                {
                    _csp = new CspResponseInterceptor(Browser.CoreWebView2);
                    if (!await _csp.StartAsync()) _csp = null;
                }

                if (_dial == null) _dial = new DialService(request => SendEvent("dial-request", request));
                if (_gamepads == null)
                {
                    _gamepads = new XboxGamepadBridge(state => SendEvent("xbox-gamepad-state", state));
                    _gamepads.Start();
                }

                _ready = true;
                StartupStatus.Text = "YouTube wird geladen …";
                Browser.CoreWebView2.Navigate(YouTubeUrl);
            }
            catch (Exception error)
            {
                _ready = false;
                StartupProgress.IsActive = false;
                StartupProgress.Visibility = Visibility.Collapsed;
                RetryButton.Visibility = Visibility.Visible;
                RetryButton.Focus(FocusState.Programmatic);
                StartupStatus.Text = "Start fehlgeschlagen: " + error.Message;
                System.Diagnostics.Debug.WriteLine("VacuumTube startup failed: " + error);
            }
            finally
            {
                _initializing = false;
            }
        }

        private void ConfigureWebView()
        {
            var core = Browser.CoreWebView2;
            core.Settings.IsScriptEnabled = true;
            core.Settings.IsWebMessageEnabled = true;
            core.Settings.AreDefaultScriptDialogsEnabled = false;
#if DEBUG
            core.Settings.AreDevToolsEnabled = true;
#else
            core.Settings.AreDevToolsEnabled = false;
#endif
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.UserAgent = ClientUserAgent;

            core.WebMessageReceived += OnWebMessageReceived;
            core.NavigationCompleted += OnNavigationCompleted;
            core.WindowCloseRequested += (s, e) => Windows.ApplicationModel.Core.CoreApplication.Exit();
            core.NewWindowRequested += OnNewWindowRequested;
            core.PermissionRequested += OnPermissionRequested;
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += OnWebResourceRequested;
        }


        private void OnNavigationCompleted(CoreWebView2 sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess)
            {
                StartupOverlay.Visibility = Visibility.Collapsed;
                return;
            }

            _ready = false;
            StartupOverlay.Visibility = Visibility.Visible;
            StartupProgress.IsActive = false;
            StartupProgress.Visibility = Visibility.Collapsed;
            RetryButton.Visibility = Visibility.Visible;
            RetryButton.Focus(FocusState.Programmatic);
            StartupStatus.Text = "YouTube konnte nicht geladen werden (" + e.WebErrorStatus + ").";
        }

        private void OnWebResourceRequested(CoreWebView2 sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            try
            {
                var uri = new Uri(e.Request.Uri);
                if (uri.Host.Equals("csp.withgoogle.com", StringComparison.OrdinalIgnoreCase))
                {
                    var stream = new InMemoryRandomAccessStream();
                    e.Response = sender.Environment.CreateWebResourceResponse(stream, 204, "No Content", "Content-Type: text/plain\r\n");
                    return;
                }
                e.Request.Headers.SetHeader("User-Agent", uri.Host.Equals("www.youtube.com", StringComparison.OrdinalIgnoreCase) ? NetworkUserAgent : GenericUserAgent);
            }
            catch { }
        }

        private async void OnNewWindowRequested(CoreWebView2 sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)) await Launcher.LaunchUriAsync(uri);
        }

        private void OnPermissionRequested(CoreWebView2 sender, CoreWebView2PermissionRequestedEventArgs e)
        {
            if (e.PermissionKind != CoreWebView2PermissionKind.Microphone) return;

            var isYouTube = Uri.TryCreate(e.Uri, UriKind.Absolute, out var origin) &&
                (origin.Host.Equals("youtube.com", StringComparison.OrdinalIgnoreCase) ||
                 origin.Host.EndsWith(".youtube.com", StringComparison.OrdinalIgnoreCase));
            var allowed = isYouTube && _microphone.GetStatus() == "granted";
            e.State = allowed ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
            e.SavesInProfile = allowed;
        }

        private async void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            JObject message;
            try { message = JObject.Parse(e.WebMessageAsJson); }
            catch { return; }
            if ((string)message["type"] != "invoke") return;

            var id = (int?)message["id"] ?? 0;
            var channel = (string)message["channel"] ?? string.Empty;
            var args = message["args"] as JArray ?? new JArray();
            try
            {
                var result = await InvokeAsync(channel, args);
                if (id > 0) Reply(id, result ?? JValue.CreateNull(), null);
            }
            catch (Exception error)
            {
                if (id > 0) Reply(id, null, error.Message);
            }
        }

        private async Task<JToken> InvokeAsync(string channel, JArray args)
        {
            switch (channel)
            {
                case "set-config":
                    var updated = _config.Update(args.ElementAtOrDefault(0) as JObject);
                    SendEvent("config-update", updated);
                    return updated;
                case "is-focused": return _isFocused;
                case "is-steam": return false;
                case "reload": Browser.Reload(); return true;
                case "set-fullscreen": ApplicationView.GetForCurrentView().TryEnterFullScreenMode(); return true;
                case "set-on-top": return false;
                case "get-deeplink": return App.PendingDeepLink == null ? JValue.CreateNull() : new JValue(App.PendingDeepLink);
                case "get-runtime-diagnostics": return GetRuntimeDiagnostics();
                case "relaunch-app": Browser.Reload(); return true;
                case "exit-app": Windows.ApplicationModel.Core.CoreApplication.Exit(); return true;
                case "request-microphone-permission": return await _microphone.RequestAsync();
                case "get-microphone-permission-status": return _microphone.GetStatus();
                case "reset-microphone-permission": return _microphone.Reset();
                case "open-microphone-privacy-settings": return await Launcher.LaunchUriAsync(new Uri("ms-settings:privacy-microphone"));
                case "open-external": return await LaunchArgUriAsync(args, 0);
                case "open-path": return false;
                case "http-request": return await ProxyHttpRequestAsync(args.ElementAtOrDefault(0) as JObject);
                case "dial-register-route": return true;
                case "dial-start": return await _dial.StartAsync(args.ElementAtOrDefault(0) as JObject);
                case "dial-response":
                    _dial.CompleteResponse((string)args.ElementAtOrDefault(0), args.ElementAtOrDefault(1) as JObject);
                    return true;
                default: throw new NotSupportedException("Unknown bridge channel: " + channel);
            }
        }

        private static async Task<JObject> ProxyHttpRequestAsync(JObject options)
        {
            var url = (string)options?["url"];
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
                !uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase) ||
                !ProxyHosts.Contains(uri.Host))
            {
                throw new InvalidOperationException("Blocked native HTTP proxy target");
            }

            var methodName = ((string)options?["method"] ?? "GET").Trim().ToUpperInvariant();
            using (var client = new Windows.Web.Http.HttpClient())
            using (var request = new Windows.Web.Http.HttpRequestMessage(new Windows.Web.Http.HttpMethod(methodName), uri))
            {
                var headers = options?["headers"] as JObject;
                if (headers != null)
                {
                    foreach (var property in headers.Properties())
                    {
                        request.Headers.TryAppendWithoutValidation(property.Name, (string)property.Value ?? property.Value.ToString(Formatting.None));
                    }
                }

                var body = options?["body"];
                if (body != null && body.Type != JTokenType.Null && methodName != "GET" && methodName != "HEAD")
                {
                    var contentType = (string)options?["contentType"] ?? "application/json";
                    var text = body.Type == JTokenType.String ? (string)body : body.ToString(Formatting.None);
                    request.Content = new Windows.Web.Http.HttpStringContent(text ?? string.Empty, Windows.Storage.Streams.UnicodeEncoding.Utf8, contentType);
                }

                using (var response = await client.SendRequestAsync(request))
                {
                    var responseBody = response.Content == null ? string.Empty : await response.Content.ReadAsStringAsync();
                    var responseHeaders = new JObject();
                    foreach (var pair in response.Headers) responseHeaders[pair.Key] = pair.Value;
                    if (response.Content != null)
                    {
                        foreach (var pair in response.Content.Headers) responseHeaders[pair.Key] = pair.Value;
                    }

                    return new JObject
                    {
                        ["status"] = (int)response.StatusCode,
                        ["statusText"] = response.ReasonPhrase ?? response.StatusCode.ToString(),
                        ["headers"] = responseHeaders,
                        ["body"] = responseBody
                    };
                }
            }
        }

        private static async Task<bool> LaunchArgUriAsync(JArray args, int index)
        {
            var value = (string)args.ElementAtOrDefault(index);
            return Uri.TryCreate(value, UriKind.Absolute, out var uri) && await Launcher.LaunchUriAsync(uri);
        }

        private void Reply(int id, JToken result, string error)
        {
            var message = new JObject { ["type"] = "reply", ["id"] = id };
            if (error == null) message["result"] = result ?? JValue.CreateNull();
            else message["error"] = error;
            Browser.CoreWebView2.PostWebMessageAsJson(message.ToString(Formatting.None));
        }

        private void SendEvent(string channel, JToken argument)
        {
            if (!_ready || Browser.CoreWebView2 == null) return;
            var message = new JObject
            {
                ["type"] = "event",
                ["channel"] = channel,
                ["args"] = new JArray(argument ?? JValue.CreateNull())
            };
            var json = message.ToString(Formatting.None);
            if (Dispatcher.HasThreadAccess)
            {
                try { Browser.CoreWebView2.PostWebMessageAsJson(json); }
                catch { }
                return;
            }

            _ = Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () =>
            {
                try { Browser.CoreWebView2.PostWebMessageAsJson(json); }
                catch { }
            });
        }

        private void OnWindowActivated(CoreWindow sender, WindowActivatedEventArgs args)
        {
            _isFocused = args.WindowActivationState != CoreWindowActivationState.Deactivated;
            if (!_ready) return;
            SendEvent(_isFocused ? "focus" : "blur", JValue.CreateNull());
        }

        private JObject GetRuntimeDiagnostics()
        {
            return new JObject
            {
                ["appMemoryUsageBytes"] = new JValue(MemoryManager.AppMemoryUsage),
                ["appMemoryUsageLimitBytes"] = new JValue(MemoryManager.AppMemoryUsageLimit),
                ["expectedAppMemoryUsageLimitBytes"] = new JValue(MemoryManager.ExpectedAppMemoryUsageLimit),
                ["appMemoryUsageLevel"] = MemoryManager.AppMemoryUsageLevel.ToString(),
                ["ready"] = _ready,
                ["suspended"] = _suspended,
                ["webViewSuspended"] = _webViewSuspended || (Browser.CoreWebView2?.IsSuspended ?? false),
                ["focused"] = _isFocused,
                ["webViewVersion"] = Browser.CoreWebView2?.Environment?.BrowserVersionString ?? string.Empty
            };
        }

        private static JObject GetPlatformInfo()
        {
            var version = ulong.Parse(AnalyticsInfo.VersionInfo.DeviceFamilyVersion);
            var osVersion = $"{(version & 0xFFFF000000000000UL) >> 48}.{(version & 0x0000FFFF00000000UL) >> 32}.{(version & 0x00000000FFFF0000UL) >> 16}.{version & 0x000000000000FFFFUL}";
            var device = new EasClientDeviceInformation();
            return new JObject
            {
                ["deviceFamily"] = AnalyticsInfo.VersionInfo.DeviceFamily,
                ["deviceName"] = string.IsNullOrWhiteSpace(device.FriendlyName) ? "Xbox" : device.FriendlyName,
                ["model"] = string.IsNullOrWhiteSpace(device.SystemProductName) ? "Xbox One / Series X|S" : device.SystemProductName,
                ["manufacturer"] = device.SystemManufacturer,
                ["osVersion"] = osVersion
            };
        }

        private static async Task<string> ReadAppTextAsync(string uri)
        {
            var file = await StorageFile.GetFileFromApplicationUriAsync(new Uri(uri));
            return await FileIO.ReadTextAsync(file);
        }

        internal async Task SuspendAsync()
        {
            if (_suspended) return;
            _suspended = true;
            SendEvent("host-suspending", JValue.CreateNull());
            _gamepads?.Stop();
            _dial?.Dispose();
            _dial = null;
            if (_csp != null)
            {
                await _csp.StopAsync();
                _csp = null;
            }

            // Microsoft recommends TrySuspendAsync during the UWP suspending handler.
            // The WebView must be invisible before the call.
            if (Browser.CoreWebView2 != null)
            {
                Browser.Visibility = Visibility.Collapsed;
                try
                {
                    _webViewSuspended = await Browser.CoreWebView2.TrySuspendAsync();
                }
                catch (Exception error)
                {
                    _webViewSuspended = false;
                    System.Diagnostics.Debug.WriteLine("WebView2 suspend failed: " + error);
                }
            }
        }

        internal async Task ResumeAsync()
        {
            if (!_suspended) return;
            _suspended = false;
            if (!_ready)
            {
                Browser.Visibility = Visibility.Visible;
                await InitializeAsync();
                return;
            }

            try
            {
                if (_webViewSuspended || Browser.CoreWebView2.IsSuspended)
                    Browser.CoreWebView2.Resume();
            }
            catch (Exception error)
            {
                System.Diagnostics.Debug.WriteLine("WebView2 resume failed: " + error);
            }
            finally
            {
                _webViewSuspended = false;
                Browser.Visibility = Visibility.Visible;
            }

            if (_csp == null)
            {
                _csp = new CspResponseInterceptor(Browser.CoreWebView2);
                if (!await _csp.StartAsync()) _csp = null;
            }
            if (_dial == null) _dial = new DialService(request => SendEvent("dial-request", request));
            if (_gamepads == null) _gamepads = new XboxGamepadBridge(state => SendEvent("xbox-gamepad-state", state));
            _gamepads.Start();
            SendEvent("host-resumed", JValue.CreateNull());
        }

        private async void OnUnloaded(object sender, RoutedEventArgs e)
        {
            await SuspendAsync();
            _ready = false;
            if (_activationHooked)
            {
                Window.Current.CoreWindow.Activated -= OnWindowActivated;
                _activationHooked = false;
            }
            _gamepads = null;
        }
    }
}
