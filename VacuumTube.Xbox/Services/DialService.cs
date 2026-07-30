using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Windows.Networking;
using Windows.Networking.Connectivity;
using Windows.Networking.Sockets;
using Windows.Storage.Streams;

namespace VacuumTube.Xbox.Services
{
    internal sealed class DialService : IDisposable
    {
        private const string MulticastAddress = "239.255.255.250";
        private readonly Action<JObject> _sendRequestToWeb;
        private readonly ConcurrentDictionary<string, TaskCompletionSource<JObject>> _pending = new ConcurrentDictionary<string, TaskCompletionSource<JObject>>();
        private DatagramSocket _ssdp;
        private StreamSocketListener _http;
        private string _localIp;
        private string _port;
        private JObject _device;
        private bool _started;

        public DialService(Action<JObject> sendRequestToWeb) => _sendRequestToWeb = sendRequestToWeb;

        public async Task<bool> StartAsync(JObject device)
        {
            if (_started) return true;
            _device = device ?? new JObject();
            _localIp = FindLocalIpv4();
            if (string.IsNullOrWhiteSpace(_localIp)) return false;

            try
            {
                _http = new StreamSocketListener();
                _http.Control.KeepAlive = false;
                _http.ConnectionReceived += OnConnectionReceived;
                await _http.BindServiceNameAsync("0");
                _port = _http.Information.LocalPort;

                _ssdp = new DatagramSocket();
                _ssdp.Control.MulticastOnly = true;
                _ssdp.MessageReceived += OnSsdpMessage;
                await _ssdp.BindServiceNameAsync("1900");
                _ssdp.JoinMulticastGroup(new HostName(MulticastAddress));
                _started = true;
                return true;
            }
            catch (Exception error)
            {
                System.Diagnostics.Debug.WriteLine("DIAL startup failed: " + error);
                Dispose();
                return false;
            }
        }

        public void CompleteResponse(string id, JObject response)
        {
            if (id != null && _pending.TryRemove(id, out var completion)) completion.TrySetResult(response ?? new JObject());
        }

        private async void OnSsdpMessage(DatagramSocket sender, DatagramSocketMessageReceivedEventArgs args)
        {
            try
            {
                var reader = args.GetDataReader();
                var message = reader.ReadString(reader.UnconsumedBufferLength);
                if (!message.StartsWith("M-SEARCH * HTTP/1.1", StringComparison.OrdinalIgnoreCase)) return;
                if (message.IndexOf("urn:dial-multiscreen-org:service:dial:1", StringComparison.OrdinalIgnoreCase) < 0) return;

                var uuid = (string)_device["deviceId"] ?? Guid.NewGuid().ToString();
                var response = "HTTP/1.1 200 OK\r\n" +
                    "CACHE-CONTROL: max-age=1800\r\n" +
                    "EXT:\r\n" +
                    $"LOCATION: http://{_localIp}:{_port}/ssdp/device-desc.xml\r\n" +
                    "SERVER: Xbox/10.0 UPnP/1.0 VacuumTube/1.8.1\r\n" +
                    "ST: urn:dial-multiscreen-org:service:dial:1\r\n" +
                    $"USN: uuid:{uuid}::urn:dial-multiscreen-org:service:dial:1\r\n\r\n";

                using (var stream = await sender.GetOutputStreamAsync(args.RemoteAddress, args.RemotePort))
                using (var writer = new DataWriter(stream))
                {
                    writer.UnicodeEncoding = UnicodeEncoding.Utf8;
                    writer.WriteString(response);
                    await writer.StoreAsync();
                }
            }
            catch (Exception error)
            {
                System.Diagnostics.Debug.WriteLine("DIAL SSDP response failed: " + error);
            }
        }

        private async void OnConnectionReceived(StreamSocketListener sender, StreamSocketListenerConnectionReceivedEventArgs args)
        {
            using (args.Socket)
            {
                try
                {
                    var request = await ReadRequestAsync(args.Socket);
                    if (request == null) return;
                    JObject response;
                    if (request.Path == "/" || request.Path == "/ssdp/device-desc.xml")
                    {
                        response = new JObject
                        {
                            ["responseCode"] = 200,
                            ["headers"] = new JObject
                            {
                                ["Content-Type"] = "text/xml; charset=utf-8",
                                ["Application-URL"] = $"http://{_localIp}:{_port}/apps"
                            },
                            ["body"] = BuildDeviceDescription()
                        };
                    }
                    else if (request.Path.StartsWith("/apps", StringComparison.OrdinalIgnoreCase))
                    {
                        response = await ForwardToWebAsync(request);
                    }
                    else
                    {
                        response = new JObject { ["responseCode"] = 404, ["headers"] = new JObject(), ["body"] = "" };
                    }
                    await WriteResponseAsync(args.Socket, response);
                }
                catch (Exception error)
                {
                    System.Diagnostics.Debug.WriteLine("DIAL HTTP request failed: " + error);
                }
            }
        }

        private async Task<JObject> ForwardToWebAsync(HttpRequest request)
        {
            var id = Guid.NewGuid().ToString("N");
            var completion = new TaskCompletionSource<JObject>();
            _pending[id] = completion;
            _sendRequestToWeb(new JObject
            {
                ["id"] = id,
                ["method"] = request.Method,
                ["path"] = request.Path,
                ["host"] = $"{_localIp}:{_port}",
                ["body"] = request.Body ?? ""
            });

            var finished = await Task.WhenAny(completion.Task, Task.Delay(TimeSpan.FromSeconds(10)));
            if (finished != completion.Task)
            {
                _pending.TryRemove(id, out _);
                return new JObject { ["responseCode"] = 504, ["headers"] = new JObject(), ["body"] = "" };
            }
            return await completion.Task;
        }

        private static async Task<HttpRequest> ReadRequestAsync(StreamSocket socket)
        {
            var reader = new DataReader(socket.InputStream) { UnicodeEncoding = UnicodeEncoding.Utf8, InputStreamOptions = InputStreamOptions.Partial };
            var text = new StringBuilder();
            int contentLength = 0;
            int headerEnd = -1;
            for (var i = 0; i < 32; i++)
            {
                var loaded = await reader.LoadAsync(4096);
                if (loaded == 0) break;
                text.Append(reader.ReadString(loaded));
                var current = text.ToString();
                if (headerEnd < 0)
                {
                    headerEnd = current.IndexOf("\r\n\r\n", StringComparison.Ordinal);
                    if (headerEnd >= 0)
                    {
                        foreach (var line in current.Substring(0, headerEnd).Split(new[] { "\r\n" }, StringSplitOptions.None))
                        {
                            if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                                int.TryParse(line.Substring(line.IndexOf(':') + 1).Trim(), out contentLength);
                        }
                    }
                }
                if (headerEnd >= 0 && current.Length >= headerEnd + 4 + contentLength) break;
            }
            reader.DetachStream();

            var raw = text.ToString();
            headerEnd = raw.IndexOf("\r\n\r\n", StringComparison.Ordinal);
            if (headerEnd < 0) return null;
            var lines = raw.Substring(0, headerEnd).Split(new[] { "\r\n" }, StringSplitOptions.None);
            var first = lines[0].Split(' ');
            if (first.Length < 2) return null;
            return new HttpRequest
            {
                Method = first[0].ToUpperInvariant(),
                Path = first[1],
                Body = raw.Substring(Math.Min(raw.Length, headerEnd + 4))
            };
        }

        private static async Task WriteResponseAsync(StreamSocket socket, JObject response)
        {
            var status = (int?)response["responseCode"] ?? 200;
            var body = (string)response["body"] ?? "";
            var bytes = Encoding.UTF8.GetBytes(body);
            var headers = response["headers"] as JObject ?? new JObject();
            var output = new StringBuilder();
            output.Append($"HTTP/1.1 {status} {StatusText(status)}\r\n");
            output.Append("Server: VacuumTube Xbox\r\n");
            foreach (var property in headers.Properties()) output.Append($"{property.Name}: {property.Value}\r\n");
            output.Append($"Content-Length: {bytes.Length}\r\nConnection: close\r\n\r\n");
            output.Append(body);

            using (var writer = new DataWriter(socket.OutputStream))
            {
                writer.UnicodeEncoding = UnicodeEncoding.Utf8;
                writer.WriteString(output.ToString());
                await writer.StoreAsync();
                await writer.FlushAsync();
            }
        }

        private string BuildDeviceDescription()
        {
            string E(string value) => WebUtility.HtmlEncode(value ?? "");
            var uuid = E((string)_device["deviceId"] ?? Guid.NewGuid().ToString());
            var friendly = E((string)_device["friendlyName"] ?? "VacuumTube on Xbox");
            var model = E((string)_device["modelName"] ?? "Xbox One / Series X|S");
            return $"<?xml version=\"1.0\"?><root xmlns=\"urn:schemas-upnp-org:device-1-0\"><specVersion><major>1</major><minor>0</minor></specVersion><URLBase>http://{_localIp}:{_port}</URLBase><device><deviceType>urn:dial-multiscreen-org:device:dial:1</deviceType><friendlyName>{friendly}</friendlyName><manufacturer>Microsoft / VacuumTube</manufacturer><modelName>{model}</modelName><UDN>uuid:{uuid}</UDN></device></root>";
        }

        private static string FindLocalIpv4() => NetworkInformation.GetHostNames()
            .FirstOrDefault(host => host.Type == HostNameType.Ipv4 && host.IPInformation?.NetworkAdapter != null)?.CanonicalName;

        private static string StatusText(int status) => status == 200 ? "OK" : status == 201 ? "Created" : status == 204 ? "No Content" : status == 400 ? "Bad Request" : status == 404 ? "Not Found" : status == 500 ? "Internal Server Error" : status == 504 ? "Gateway Timeout" : "OK";

        public void Dispose()
        {
            _started = false;
            _ssdp?.Dispose();
            _http?.Dispose();
            _ssdp = null;
            _http = null;
        }

        private sealed class HttpRequest
        {
            public string Method { get; set; }
            public string Path { get; set; }
            public string Body { get; set; }
        }
    }
}
