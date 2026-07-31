using System;
using System.Threading.Tasks;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using VacuumTubeXbox.Services;
using Windows.System;
using Windows.UI.Core;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace VacuumTubeXbox
{
    public sealed partial class MainPage : Page, IDisposable
    {
        private static readonly Uri StartUri = new Uri("https://www.youtube.com/tv");

        private JsonStorageService _storage;
        private ModApiService _api;
        private DialService _dial;
        private DisplayRequestService _displayRequest;
        private ExtensionRuntimeService _runtime;
        private NativeBridgeService _bridge;
        private XboxControllerService _controller;
        private bool _initialized;
        private bool _disposed;

        public MainPage()
        {
#if DEBUG
            Environment.SetEnvironmentVariable(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--enable-features=msEdgeDevToolsWdpRemoteDebugging --autoplay-policy=no-user-gesture-required");
#endif
            Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF000000");
            InitializeComponent();
            Loaded += OnLoaded;
            Unloaded += OnUnloaded;
        }

        protected override void OnNavigatedTo(NavigationEventArgs e)
        {
            base.OnNavigatedTo(e);
            ApplicationView.GetForCurrentView().TryEnterFullScreenMode();
            SystemNavigationManager.GetForCurrentView().BackRequested += OnBackRequested;
        }

        protected override void OnNavigatedFrom(NavigationEventArgs e)
        {
            SystemNavigationManager.GetForCurrentView().BackRequested -= OnBackRequested;
            base.OnNavigatedFrom(e);
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            if (_initialized || _disposed) return;
            await InitializeAsync();
        }

        private async Task InitializeAsync()
        {
            ShowLoading("VacuumTube Xbox wird geladen", "WebView2 und integrierte Mods werden initialisiert.");
            try
            {
                await Browser.EnsureCoreWebView2Async();
                ConfigureWebView();

                _storage = new JsonStorageService();
                await _storage.PurgeDiagnosticLogsAsync();
                _api = new ModApiService();
                _dial = new DialService();
                _displayRequest = new DisplayRequestService();
                _runtime = new ExtensionRuntimeService(Browser);
                await _runtime.RegisterAsync();

                _bridge = new NativeBridgeService(Browser, _storage, _api, _dial, _displayRequest);
                _bridge.Attach();

                _controller = new XboxControllerService(Browser);
                _controller.Start();

                try
                {
                    await _dial.StartAsync();
                }
                catch (Exception dialError)
                {
                    System.Diagnostics.Debug.WriteLine("DIAL startup failed: " + dialError);
                }

                _initialized = true;
                Browser.Source = StartUri;
            }
            catch (Exception error)
            {
                ShowError("VacuumTube Xbox konnte nicht gestartet werden", error.Message);
            }
        }

        private void ConfigureWebView()
        {
            CoreWebView2 core = Browser.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
#if DEBUG
            core.Settings.AreDevToolsEnabled = true;
#else
            core.Settings.AreDevToolsEnabled = false;
#endif
            core.NavigationStarting += OnNavigationStarting;
            core.NavigationCompleted += OnNavigationCompleted;
            core.NewWindowRequested += OnNewWindowRequested;
            core.ProcessFailed += OnProcessFailed;
            core.DocumentTitleChanged += OnDocumentTitleChanged;
            core.PermissionRequested += OnPermissionRequested;
        }

        private void OnNavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs args)
        {
            if (!IsAllowedNavigation(args.Uri))
            {
                args.Cancel = true;
                ShowError("Navigation blockiert", "VacuumTube Xbox lädt nur HTTPS-Seiten von YouTube und Google.");
                return;
            }
            ShowLoading("YouTube TV wird geladen", "Mods werden vor dem Seitencode eingebunden.");
        }

        private void OnNavigationCompleted(CoreWebView2 sender, CoreWebView2NavigationCompletedEventArgs args)
        {
            if (args.IsSuccess)
            {
                StatusOverlay.Visibility = Visibility.Collapsed;
                Browser.Focus(FocusState.Programmatic);
            }
            else
            {
                ShowError("YouTube TV konnte nicht geladen werden", "WebView2-Fehler: " + args.WebErrorStatus);
            }
        }

        private void OnNewWindowRequested(CoreWebView2 sender, CoreWebView2NewWindowRequestedEventArgs args)
        {
            args.Handled = true;
            if (IsAllowedNavigation(args.Uri)) Browser.Source = new Uri(args.Uri);
        }

        private void OnProcessFailed(CoreWebView2 sender, CoreWebView2ProcessFailedEventArgs args)
        {
            ShowError("WebView2 wurde beendet", "Fehlerart: " + args.ProcessFailedKind + ". Starte die Seite erneut.");
        }

        private static void OnPermissionRequested(CoreWebView2 sender, CoreWebView2PermissionRequestedEventArgs args)
        {
            if (args.PermissionKind != CoreWebView2PermissionKind.Microphone) return;
            if (!IsAllowedNavigation(args.Uri))
            {
                args.State = CoreWebView2PermissionState.Deny;
                return;
            }
            args.State = CoreWebView2PermissionState.Allow;
            args.SavesInProfile = true;
        }

        private void OnDocumentTitleChanged(CoreWebView2 sender, object args)
        {
            string title = sender.DocumentTitle;
            ApplicationView.GetForCurrentView().Title = string.IsNullOrWhiteSpace(title) ? "VacuumTube Xbox" : title;
        }

        private async void OnBackRequested(object sender, BackRequestedEventArgs e)
        {
            if (StatusOverlay.Visibility == Visibility.Visible) return;
            e.Handled = true;
            try
            {
                await Browser.CoreWebView2.ExecuteScriptAsync("(() => { const event = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }); document.dispatchEvent(event); })();");
            }
            catch { }
        }

        private static bool IsAllowedNavigation(string rawUri)
        {
            if (!Uri.TryCreate(rawUri, UriKind.Absolute, out Uri uri)) return false;
            if (!uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase)) return false;
            string host = uri.Host.ToLowerInvariant();
            return host == "youtube.com" || host.EndsWith(".youtube.com", StringComparison.Ordinal)
                || host == "google.com" || host.EndsWith(".google.com", StringComparison.Ordinal)
                || host == "gstatic.com" || host.EndsWith(".gstatic.com", StringComparison.Ordinal)
                || host == "googleusercontent.com" || host.EndsWith(".googleusercontent.com", StringComparison.Ordinal);
        }

        private void ShowLoading(string title, string details)
        {
            StatusTitle.Text = title;
            StatusDetails.Text = details;
            LoadingRing.IsActive = true;
            LoadingRing.Visibility = Visibility.Visible;
            RetryButton.Visibility = Visibility.Collapsed;
            StatusOverlay.Visibility = Visibility.Visible;
        }

        private void ShowError(string title, string details)
        {
            StatusTitle.Text = title;
            StatusDetails.Text = details;
            LoadingRing.IsActive = false;
            LoadingRing.Visibility = Visibility.Collapsed;
            RetryButton.Visibility = Visibility.Visible;
            StatusOverlay.Visibility = Visibility.Visible;
            RetryButton.Focus(FocusState.Programmatic);
        }

        private async void RetryButton_Click(object sender, RoutedEventArgs e)
        {
            if (!_initialized)
            {
                await InitializeAsync();
                return;
            }
            ShowLoading("YouTube TV wird neu geladen", "Bitte warten.");
            Browser.CoreWebView2?.Reload();
        }

        internal async Task NotifyLifecycleAsync(string state)
        {
            if (_disposed || Browser?.CoreWebView2 == null) return;
            try
            {
                string safeState = state == "suspending" ? "suspending" : "resumed";
                Browser.CoreWebView2.PostWebMessageAsJson("{\"type\":\"appLifecycle\",\"state\":\"" + safeState + "\"}");
                if (safeState == "resumed") await Task.Delay(50);
            }
            catch { }
        }

        private void OnUnloaded(object sender, RoutedEventArgs e) => Dispose();

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            Loaded -= OnLoaded;
            Unloaded -= OnUnloaded;
            _controller?.Dispose();
            _bridge?.Dispose();
            _api?.Dispose();
            _dial?.Dispose();
            _displayRequest?.Dispose();
            if (Browser?.CoreWebView2 != null)
            {
                Browser.CoreWebView2.NavigationStarting -= OnNavigationStarting;
                Browser.CoreWebView2.NavigationCompleted -= OnNavigationCompleted;
                Browser.CoreWebView2.NewWindowRequested -= OnNewWindowRequested;
                Browser.CoreWebView2.ProcessFailed -= OnProcessFailed;
                Browser.CoreWebView2.DocumentTitleChanged -= OnDocumentTitleChanged;
                Browser.CoreWebView2.PermissionRequested -= OnPermissionRequested;
            }
        }
    }
}
