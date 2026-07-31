using System;
using System.Threading.Tasks;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Windows.Data.Json;
using Windows.UI.Core;

namespace VacuumTubeXbox.Services
{
    internal sealed class NativeBridgeService : IDisposable
    {
        private readonly WebView2 _webView;
        private readonly JsonStorageService _storage;
        private readonly ModApiService _api;
        private readonly DialService _dial;
        private readonly DisplayRequestService _displayRequest;
        private bool _attached;
        private bool _disposed;

        public NativeBridgeService(WebView2 webView, JsonStorageService storage, ModApiService api, DialService dial, DisplayRequestService displayRequest)
        {
            _webView = webView;
            _storage = storage;
            _api = api;
            _dial = dial;
            _displayRequest = displayRequest;
        }

        public void Attach()
        {
            if (_disposed) throw new ObjectDisposedException(nameof(NativeBridgeService));
            if (_attached) return;
            if (_webView.CoreWebView2 == null) throw new InvalidOperationException("CoreWebView2 is not initialized");
            _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            _dial.AttachWebSender(PostToWebAsync);
            _attached = true;
        }

        public async Task PostToWebAsync(JsonObject message)
        {
            if (_disposed || message == null) return;
            string json = message.Stringify();
            if (_webView.Dispatcher.HasThreadAccess)
            {
                _webView.CoreWebView2?.PostWebMessageAsJson(json);
                return;
            }
            await _webView.Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () =>
            {
                if (!_disposed) _webView.CoreWebView2?.PostWebMessageAsJson(json);
            });
        }

        private async void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            JsonObject message;
            try { message = JsonObject.Parse(args.WebMessageAsJson); }
            catch { return; }

            string type = message.GetNamedString("type", string.Empty);
            if (type == "dialResponse")
            {
                _dial.CompleteJsResponse(message);
                return;
            }
            if (type != "nativeRpc") return;

            string id = message.GetNamedString("id", string.Empty);
            string operation = message.GetNamedString("operation", string.Empty);
            JsonObject payload = message.GetNamedObject("payload", new JsonObject());
            try
            {
                IJsonValue data = await HandleRpcAsync(operation, payload);
                await SendResultAsync(id, true, data, null);
            }
            catch (Exception error)
            {
                await SendResultAsync(id, false, JsonValue.CreateNullValue(), error.Message);
            }
        }

        private async Task<IJsonValue> HandleRpcAsync(string operation, JsonObject payload)
        {
            switch (operation)
            {
                case "storageGet":
                    return await _storage.GetAreaAsync(payload.GetNamedString("area", "sync"));
                case "storageSet":
                    await _storage.SetAsync(payload.GetNamedString("area", "sync"), payload.GetNamedObject("items", new JsonObject()));
                    return JsonValue.CreateBooleanValue(true);
                case "storageRemove":
                    await _storage.RemoveAsync(payload.GetNamedString("area", "sync"), payload.GetNamedArray("keys", new JsonArray()));
                    return JsonValue.CreateBooleanValue(true);
                case "storageClear":
                    await _storage.ClearAsync(payload.GetNamedString("area", "sync"));
                    return JsonValue.CreateBooleanValue(true);
                case "apiRequest":
                {
                    string apiOperation = payload.GetNamedString("operation", string.Empty);
                    JsonObject apiPayload = payload.GetNamedObject("payload", new JsonObject());
                    try
                    {
                        IJsonValue result = await _api.HandleAsync(apiOperation, apiPayload);
                        return new JsonObject { ["ok"] = JsonValue.CreateBooleanValue(true), ["data"] = result ?? JsonValue.CreateNullValue() };
                    }
                    catch (Exception error)
                    {
                        return new JsonObject { ["ok"] = JsonValue.CreateBooleanValue(false), ["error"] = JsonValue.CreateStringValue(error.Message) };
                    }
                }
                case "dialRegister":
                    _dial.RegisterApp(payload.GetNamedString("appName", "YouTube"));
                    return _dial.Status();
                case "dialSetEnabled":
                    return await _dial.SetEnabledAsync(payload.GetNamedBoolean("enabled", true));
                case "displayKeepActive":
                    _displayRequest?.SetActive(payload.GetNamedBoolean("active", false));
                    return JsonValue.CreateBooleanValue(_displayRequest?.IsActive == true);
                case "runtimeMessage":
                    return JsonValue.CreateNullValue();
                case "appInfo":
                    return new JsonObject
                    {
                        ["name"] = JsonValue.CreateStringValue("VacuumTube Xbox"),
                        ["version"] = JsonValue.CreateStringValue("1.1.0"),
                        ["platform"] = JsonValue.CreateStringValue("Xbox UWP WebView2")
                    };
                default:
                    throw new InvalidOperationException("Unsupported native operation: " + operation);
            }
        }

        private Task SendResultAsync(string id, bool ok, IJsonValue data, string error)
        {
            JsonObject response = new JsonObject
            {
                ["type"] = JsonValue.CreateStringValue("nativeRpcResult"),
                ["id"] = JsonValue.CreateStringValue(id ?? string.Empty),
                ["ok"] = JsonValue.CreateBooleanValue(ok),
                ["data"] = data ?? JsonValue.CreateNullValue(),
                ["error"] = JsonValue.CreateStringValue(error ?? string.Empty)
            };
            return PostToWebAsync(response);
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            if (_attached && _webView.CoreWebView2 != null)
            {
                _webView.CoreWebView2.WebMessageReceived -= OnWebMessageReceived;
            }
            _dial.AttachWebSender(null);
            _attached = false;
        }
    }
}
