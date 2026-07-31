using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using VacuumTubeXbox.Models;
using Windows.Data.Json;
using Windows.Networking;
using Windows.Networking.Connectivity;
using Windows.Networking.Sockets;
using Windows.Storage;
using Windows.Storage.Streams;

namespace VacuumTubeXbox.Services
{
    internal sealed class DialService : IDisposable
    {
        private const string MulticastAddress = "239.255.255.250";
        private const string MulticastPort = "1900";
        private readonly ConcurrentDictionary<string, TaskCompletionSource<DialResult>> _pending = new ConcurrentDictionary<string, TaskCompletionSource<DialResult>>();
        private readonly ConcurrentDictionary<string, byte> _registeredApps = new ConcurrentDictionary<string, byte>(StringComparer.OrdinalIgnoreCase);
        private readonly SemaphoreSlim _lifecycleGate = new SemaphoreSlim(1, 1);
        private DatagramSocket _discoverySocket;
        private StreamSocketListener _httpListener;
        private Func<JsonObject, Task> _sendToWeb;
        private bool _enabled = true;
        private bool _running;
        private bool _youtubeRunning;
        private string _localAddress = string.Empty;
        private string _httpPort = string.Empty;
        private readonly string _uuid;

        public DialService()
        {
            _registeredApps.TryAdd("YouTube", 0);
            ApplicationDataContainer settings = ApplicationData.Current.LocalSettings;
            _uuid = settings.Values["DialUuid"] as string;
            if (string.IsNullOrWhiteSpace(_uuid))
            {
                _uuid = Guid.NewGuid().ToString();
                settings.Values["DialUuid"] = _uuid;
            }
        }

        public bool IsRunning => _running;
        public string Location => _running ? $"http://{_localAddress}:{_httpPort}/ssdp/device-desc.xml" : string.Empty;

        public void AttachWebSender(Func<JsonObject, Task> sender) { _sendToWeb = sender; }

        public async Task<JsonObject> SetEnabledAsync(bool enabled)
        {
            _enabled = enabled;
            if (enabled && !_running) await StartAsync();
            else if (!enabled && _running) await StopAsync();
            return Status();
        }

        public JsonObject Status(string error = "") => new JsonObject
        {
            ["running"] = JsonValue.CreateBooleanValue(_running),
            ["location"] = JsonValue.CreateStringValue(Location),
            ["error"] = JsonValue.CreateStringValue(error ?? string.Empty)
        };

        public async Task StartAsync()
        {
            await _lifecycleGate.WaitAsync();
            try
            {
                if (!_enabled || _running) return;
                _localAddress = FindLocalIpv4();
                if (string.IsNullOrWhiteSpace(_localAddress)) throw new InvalidOperationException("No local IPv4 address available for DIAL");

                StreamSocketListener listener = null;
                Exception lastPortError = null;
                for (int port = 56789; port <= 56799; port++)
                {
                    StreamSocketListener candidate = new StreamSocketListener();
                    candidate.ConnectionReceived += OnHttpConnectionReceived;
                    try
                    {
                        _httpPort = port.ToString(CultureInfo.InvariantCulture);
                        await candidate.BindServiceNameAsync(_httpPort);
                        listener = candidate;
                        lastPortError = null;
                        break;
                    }
                    catch (Exception error)
                    {
                        lastPortError = error;
                        candidate.ConnectionReceived -= OnHttpConnectionReceived;
                        candidate.Dispose();
                    }
                }
                if (listener == null)
                {
                    throw new InvalidOperationException("DIAL HTTP listener could not bind", lastPortError);
                }

                DatagramSocket discovery = new DatagramSocket();
                discovery.Control.MulticastOnly = true;
                discovery.MessageReceived += OnDiscoveryMessageReceived;
                try
                {
                    await discovery.BindServiceNameAsync(MulticastPort);
                    discovery.JoinMulticastGroup(new HostName(MulticastAddress));
                }
                catch
                {
                    discovery.MessageReceived -= OnDiscoveryMessageReceived;
                    discovery.Dispose();
                    listener.ConnectionReceived -= OnHttpConnectionReceived;
                    listener.Dispose();
                    throw;
                }

                _httpListener = listener;
                _discoverySocket = discovery;
                _running = true;
            }
            finally
            {
                _lifecycleGate.Release();
            }
        }

        public void RegisterApp(string appName)
        {
            if (!string.IsNullOrWhiteSpace(appName)) _registeredApps.TryAdd(appName.Trim(), 0);
        }

        public void CompleteJsResponse(JsonObject message)
        {
            string id = message.GetNamedString("requestId", string.Empty);
            if (string.IsNullOrWhiteSpace(id) || !_pending.TryRemove(id, out TaskCompletionSource<DialResult> task)) return;
            DialResult result = new DialResult
            {
                Handled = message.GetNamedBoolean("handled", false),
                ResponseCode = (int)message.GetNamedNumber("responseCode", 200),
                MimeType = message.GetNamedString("mimeType", string.Empty),
                Body = message.GetNamedString("body", string.Empty)
            };
            JsonObject headers = message.GetNamedObject("headers", new JsonObject());
            foreach (KeyValuePair<string, IJsonValue> item in headers)
            {
                if (item.Value.ValueType == JsonValueType.String) result.Headers[item.Key] = item.Value.GetString();
            }
            task.TrySetResult(result);
        }

        private async void OnDiscoveryMessageReceived(DatagramSocket sender, DatagramSocketMessageReceivedEventArgs args)
        {
            try
            {
                DataReader reader = args.GetDataReader();
                reader.UnicodeEncoding = Windows.Storage.Streams.UnicodeEncoding.Utf8;
                string request = reader.ReadString(reader.UnconsumedBufferLength);
                if (!request.StartsWith("M-SEARCH * HTTP/1.1", StringComparison.OrdinalIgnoreCase)) return;
                if (request.IndexOf("urn:dial-multiscreen-org:service:dial:1", StringComparison.OrdinalIgnoreCase) < 0 &&
                    request.IndexOf("ssdp:all", StringComparison.OrdinalIgnoreCase) < 0) return;

                string response = "HTTP/1.1 200 OK\r\n"
                    + "CACHE-CONTROL: max-age=1800\r\n"
                    + "DATE: " + DateTime.UtcNow.ToString("R", CultureInfo.InvariantCulture) + "\r\n"
                    + "EXT:\r\n"
                    + "LOCATION: " + Location + "\r\n"
                    + "SERVER: Xbox/10.0 UPnP/1.0 VacuumTubeXbox/1.1\r\n"
                    + "ST: urn:dial-multiscreen-org:service:dial:1\r\n"
                    + "USN: uuid:" + _uuid + "::urn:dial-multiscreen-org:service:dial:1\r\n\r\n";
                IOutputStream stream = await sender.GetOutputStreamAsync(args.RemoteAddress, args.RemotePort);
                using (DataWriter writer = new DataWriter(stream))
                {
                    writer.UnicodeEncoding = Windows.Storage.Streams.UnicodeEncoding.Utf8;
                    writer.WriteString(response);
                    await writer.StoreAsync();
                    await writer.FlushAsync();
                    writer.DetachStream();
                }
            }
            catch { }
        }

        private async void OnHttpConnectionReceived(StreamSocketListener sender, StreamSocketListenerConnectionReceivedEventArgs args)
        {
            using (StreamSocket socket = args.Socket)
            {
                try
                {
                    HttpRequest request = await ReadRequestAsync(socket.InputStream);
                    DialResult response = await RouteRequestAsync(request);
                    await WriteResponseAsync(socket.OutputStream, response);
                }
                catch
                {
                    await WriteResponseAsync(socket.OutputStream, new DialResult { Handled = true, ResponseCode = 500, Body = string.Empty });
                }
            }
        }

        private async Task<DialResult> RouteRequestAsync(HttpRequest request)
        {
            if (request.Method == "GET" && (request.Path == "/" || request.Path == "/ssdp/device-desc.xml"))
            {
                return new DialResult
                {
                    Handled = true,
                    ResponseCode = 200,
                    MimeType = "text/xml; charset=utf-8",
                    Body = BuildDeviceDescription()
                }.WithHeader("Application-URL", $"http://{_localAddress}:{_httpPort}/apps/");
            }

            string routePath = (request.Path ?? "/").Split('?')[0];
            string[] pieces = routePath.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            string appName = pieces.Length >= 2 && pieces[0].Equals("apps", StringComparison.OrdinalIgnoreCase) ? Uri.UnescapeDataString(pieces[1]) : "YouTube";
            if (pieces.Length >= 2 && _registeredApps.ContainsKey(appName))
            {
                DialResult jsResult = await InvokeWebRouteAsync(appName, request);
                if (jsResult?.Handled == true) return jsResult;

                if (request.Method == "GET")
                {
                    return new DialResult
                    {
                        Handled = true,
                        ResponseCode = 200,
                        MimeType = "text/xml; charset=utf-8",
                        Body = BuildAppStatus(appName, _youtubeRunning)
                    };
                }
                if (request.Method == "POST")
                {
                    _youtubeRunning = true;
                    await SendLaunchFallbackAsync(request.Body);
                    return new DialResult { Handled = true, ResponseCode = 201 }
                        .WithHeader("Location", $"http://{_localAddress}:{_httpPort}/apps/{Uri.EscapeDataString(appName)}/run");
                }
                if (request.Method == "DELETE")
                {
                    _youtubeRunning = false;
                    return new DialResult { Handled = true, ResponseCode = 200 };
                }
            }
            return new DialResult { Handled = true, ResponseCode = 404 };
        }

        private async Task<DialResult> InvokeWebRouteAsync(string appName, HttpRequest request)
        {
            if (_sendToWeb == null) return null;
            string requestId = Guid.NewGuid().ToString("N");
            TaskCompletionSource<DialResult> task = new TaskCompletionSource<DialResult>();
            _pending[requestId] = task;
            JsonObject message = new JsonObject
            {
                ["type"] = JsonValue.CreateStringValue("dialRequest"),
                ["requestId"] = JsonValue.CreateStringValue(requestId),
                ["appName"] = JsonValue.CreateStringValue(appName),
                ["method"] = JsonValue.CreateStringValue(request.Method),
                ["path"] = JsonValue.CreateStringValue((request.Path ?? "/").Split('?')[0]),
                ["body"] = JsonValue.CreateStringValue(request.Body ?? string.Empty),
                ["host"] = JsonValue.CreateStringValue(_localAddress + ":" + _httpPort)
            };
            await _sendToWeb(message);
            Task completed = await Task.WhenAny(task.Task, Task.Delay(1800));
            if (completed == task.Task) return await task.Task;
            _pending.TryRemove(requestId, out _);
            return null;
        }

        private async Task SendLaunchFallbackAsync(string body)
        {
            if (_sendToWeb == null) return;
            await _sendToWeb(new JsonObject
            {
                ["type"] = JsonValue.CreateStringValue("dialLaunch"),
                ["body"] = JsonValue.CreateStringValue(body ?? string.Empty)
            });
        }

        private string BuildDeviceDescription() => "<?xml version=\"1.0\"?>"
            + "<root xmlns=\"urn:schemas-upnp-org:device-1-0\"><specVersion><major>1</major><minor>0</minor></specVersion>"
            + "<URLBase>http://" + _localAddress + ":" + _httpPort + "/</URLBase><device>"
            + "<deviceType>urn:dial-multiscreen-org:device:dial:1</deviceType>"
            + "<friendlyName>VacuumTube on Xbox</friendlyName><manufacturer>VacuumTube</manufacturer>"
            + "<modelName>VacuumTube Xbox 1.1</modelName><UDN>uuid:" + _uuid + "</UDN>"
            + "</device></root>";

        private static string BuildAppStatus(string appName, bool running) => "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            + "<service xmlns=\"urn:dial-multiscreen-org:schemas:dial\"><name>" + XmlEscape(appName) + "</name>"
            + "<options allowStop=\"true\"/><state>" + (running ? "running" : "stopped") + "</state>"
            + (running ? "<link rel=\"run\" href=\"run\"/>" : string.Empty) + "</service>";

        private static string XmlEscape(string value) => (value ?? string.Empty).Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

        private static async Task<HttpRequest> ReadRequestAsync(IInputStream input)
        {
            using (DataReader reader = new DataReader(input))
            {
                reader.UnicodeEncoding = Windows.Storage.Streams.UnicodeEncoding.Utf8;
                reader.InputStreamOptions = InputStreamOptions.Partial;
                StringBuilder text = new StringBuilder();
                int contentLength = 0;
                int headerEnd = -1;
                while (text.Length < 128 * 1024)
                {
                    uint loaded = await reader.LoadAsync(4096);
                    if (loaded == 0) break;
                    text.Append(reader.ReadString(loaded));
                    headerEnd = text.ToString().IndexOf("\r\n\r\n", StringComparison.Ordinal);
                    if (headerEnd >= 0)
                    {
                        string headers = text.ToString().Substring(0, headerEnd);
                        foreach (string line in headers.Split(new[] { "\r\n" }, StringSplitOptions.None))
                        {
                            if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase)) int.TryParse(line.Substring(line.IndexOf(':') + 1).Trim(), out contentLength);
                        }
                        int bodyChars = text.Length - headerEnd - 4;
                        if (bodyChars >= contentLength) break;
                    }
                }
                string raw = text.ToString();
                if (string.IsNullOrWhiteSpace(raw)) throw new InvalidOperationException("Empty DIAL HTTP request");
                string[] headBody = raw.Split(new[] { "\r\n\r\n" }, 2, StringSplitOptions.None);
                string headerText = headBody.Length > 0 ? headBody[0] : string.Empty;
                string[] lines = headerText.Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
                if (lines.Length == 0) throw new InvalidOperationException("Invalid DIAL HTTP request");
                string[] first = lines[0].Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                if (first.Length < 2) throw new InvalidOperationException("Invalid DIAL HTTP request line");
                string path = first[1];
                if (!path.StartsWith("/", StringComparison.Ordinal)) path = "/";
                return new HttpRequest
                {
                    Method = first[0].ToUpperInvariant(),
                    Path = path,
                    Body = headBody.Length > 1 ? headBody[1] : string.Empty
                };
            }
        }

        private static async Task WriteResponseAsync(IOutputStream output, DialResult result)
        {
            int code = result?.ResponseCode ?? 500;
            string reason = code == 200 ? "OK" : code == 201 ? "Created" : code == 204 ? "No Content" : code == 400 ? "Bad Request" : code == 404 ? "Not Found" : "Internal Server Error";
            string body = result?.Body ?? string.Empty;
            int length = Encoding.UTF8.GetByteCount(body);
            StringBuilder headers = new StringBuilder();
            headers.Append("HTTP/1.1 ").Append(code).Append(' ').Append(reason).Append("\r\n");
            headers.Append("Server: Xbox/10.0 UPnP/1.0 VacuumTubeXbox/1.1\r\n");
            headers.Append("Access-Control-Allow-Origin: *\r\n");
            if (!string.IsNullOrWhiteSpace(result?.MimeType)) headers.Append("Content-Type: ").Append(result.MimeType).Append("\r\n");
            if (result != null) foreach (KeyValuePair<string, string> header in result.Headers) headers.Append(header.Key).Append(": ").Append(header.Value).Append("\r\n");
            headers.Append("Content-Length: ").Append(length).Append("\r\nConnection: close\r\n\r\n").Append(body);
            using (DataWriter writer = new DataWriter(output))
            {
                writer.UnicodeEncoding = Windows.Storage.Streams.UnicodeEncoding.Utf8;
                writer.WriteString(headers.ToString());
                await writer.StoreAsync();
                await writer.FlushAsync();
                writer.DetachStream();
            }
        }

        private static string FindLocalIpv4()
        {
            HostName host = NetworkInformation.GetHostNames().FirstOrDefault(item =>
                item.Type == HostNameType.Ipv4 && item.IPInformation?.NetworkAdapter != null &&
                !item.CanonicalName.StartsWith("169.254.", StringComparison.Ordinal));
            return host?.CanonicalName ?? string.Empty;
        }

        public async Task StopAsync()
        {
            await _lifecycleGate.WaitAsync();
            try { StopUnlocked(); }
            finally { _lifecycleGate.Release(); }
        }

        public void Stop() => StopUnlocked();

        private void StopUnlocked()
        {
            _running = false;
            _youtubeRunning = false;
            if (_discoverySocket != null) _discoverySocket.MessageReceived -= OnDiscoveryMessageReceived;
            if (_httpListener != null) _httpListener.ConnectionReceived -= OnHttpConnectionReceived;
            _discoverySocket?.Dispose();
            _httpListener?.Dispose();
            _discoverySocket = null;
            _httpListener = null;
            _httpPort = string.Empty;
        }

        public void Dispose()
        {
            StopUnlocked();
            _lifecycleGate.Dispose();
            foreach (TaskCompletionSource<DialResult> task in _pending.Values) task.TrySetCanceled();
            _pending.Clear();
        }

        private sealed class HttpRequest
        {
            public string Method { get; set; }
            public string Path { get; set; }
            public string Body { get; set; }
        }
    }

    internal static class DialResultExtensions
    {
        public static DialResult WithHeader(this DialResult result, string key, string value)
        {
            result.Headers[key] = value;
            return result;
        }
    }
}
