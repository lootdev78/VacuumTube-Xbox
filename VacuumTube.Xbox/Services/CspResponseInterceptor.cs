using System;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace VacuumTube.Xbox.Services
{
    internal sealed class CspResponseInterceptor
    {
        private readonly CoreWebView2 _core;
        private CoreWebView2DevToolsProtocolEventReceiver _receiver;
        private bool _started;
        private bool _disabled;

        public CspResponseInterceptor(CoreWebView2 core) => _core = core ?? throw new ArgumentNullException(nameof(core));

        public async Task<bool> StartAsync()
        {
            if (_started && !_disabled) return true;

            try
            {
                _receiver = _core.GetDevToolsProtocolEventReceiver("Fetch.requestPaused");
                _receiver.DevToolsProtocolEventReceived += OnRequestPaused;
                await _core.CallDevToolsProtocolMethodAsync("Fetch.enable", @"{
                  ""patterns"": [
                    { ""urlPattern"": ""https://www.youtube.com/*"", ""resourceType"": ""Document"", ""requestStage"": ""Response"" }
                  ]
                }");
                _started = true;
                _disabled = false;
                return true;
            }
            catch (Exception error)
            {
                System.Diagnostics.Debug.WriteLine("CSP interception unavailable: " + error);
                await DisableFetchAsync();
                return false;
            }
        }

        public async Task StopAsync()
        {
            DetachReceiver();
            await DisableFetchAsync();
        }

        private async void OnRequestPaused(CoreWebView2DevToolsProtocolEventReceiver sender, CoreWebView2DevToolsProtocolEventReceivedEventArgs e)
        {
            string requestId = null;
            int? status = null;
            try
            {
                var message = JObject.Parse(e.ParameterObjectAsJson);
                requestId = (string)message["requestId"];
                status = (int?)message["responseStatusCode"];
                if (requestId == null) return;

                // A missing response status means the event unexpectedly arrived at request stage.
                // Never leave a Fetch request paused, otherwise navigation can remain blocked forever.
                if (status == null)
                {
                    await ContinueUnmodifiedAsync(requestId, false);
                    return;
                }

                var headers = message["responseHeaders"] as JArray ?? new JArray();
                var output = new JArray();
                foreach (var item in headers.OfType<JObject>())
                {
                    var name = (string)item["name"] ?? string.Empty;
                    var value = (string)item["value"] ?? string.Empty;
                    if (name.Equals("content-security-policy-report-only", StringComparison.OrdinalIgnoreCase)) continue;
                    if (name.Equals("content-security-policy", StringComparison.OrdinalIgnoreCase)) value = PatchCsp(value);
                    output.Add(new JObject { ["name"] = name, ["value"] = value });
                }

                var parameters = new JObject
                {
                    ["requestId"] = requestId,
                    ["responseCode"] = status.Value,
                    ["responseHeaders"] = output
                };
                await _core.CallDevToolsProtocolMethodAsync("Fetch.continueResponse", parameters.ToString(Formatting.None));
            }
            catch (Exception error)
            {
                System.Diagnostics.Debug.WriteLine("CSP response patch failed: " + error);
                if (requestId != null)
                {
                    await ContinueUnmodifiedAsync(requestId, status.HasValue);
                }
            }
        }

        private async Task ContinueUnmodifiedAsync(string requestId, bool responseStage)
        {
            try
            {
                var command = responseStage ? "Fetch.continueResponse" : "Fetch.continueRequest";
                await _core.CallDevToolsProtocolMethodAsync(command,
                    new JObject { ["requestId"] = requestId }.ToString(Formatting.None));
            }
            catch (Exception error)
            {
                System.Diagnostics.Debug.WriteLine("Unable to resume intercepted request; disabling CSP interception: " + error);
                await DisableFetchAsync();
            }
        }

        private async Task DisableFetchAsync()
        {
            if (_disabled) return;
            _disabled = true;
            _started = false;
            DetachReceiver();
            try
            {
                await _core.CallDevToolsProtocolMethodAsync("Fetch.disable", "{}");
            }
            catch (Exception error)
            {
                System.Diagnostics.Debug.WriteLine("Unable to disable Fetch interception: " + error);
            }
        }

        private void DetachReceiver()
        {
            if (_receiver == null) return;
            _receiver.DevToolsProtocolEventReceived -= OnRequestPaused;
            _receiver = null;
        }

        private static string PatchCsp(string header)
        {
            header = Regex.Replace(header, @"require-trusted-types-for\s+'script';?\s*", string.Empty, RegexOptions.IgnoreCase);
            header = PatchDirective(header, "style-src", value =>
                Regex.Replace(value, @"'nonce-[^']*'", string.Empty) + " 'unsafe-inline' data: *");
            header = PatchDirective(header, "font-src", value => value + " * data:");
            header = PatchDirective(header, "connect-src", value => value + " https://sponsor.ajay.app https://returnyoutubedislikeapi.com data:");
            header = PatchDirective(header, "img-src", value => value + " https://dearrow-thumb.ajay.app data:");
            return header;
        }

        private static string PatchDirective(string csp, string name, Func<string, string> patch)
        {
            var regex = new Regex(@"(?i)(?:^|;)\s*" + Regex.Escape(name) + @"\s+([^;]*)");
            var match = regex.Match(csp);
            if (!match.Success) return csp + "; " + name + " " + patch("'self'");
            var replacement = match.Value.Substring(0, match.Value.IndexOf(name, StringComparison.OrdinalIgnoreCase))
                + name + " " + patch(match.Groups[1].Value).Trim();
            return csp.Remove(match.Index, match.Length).Insert(match.Index, replacement);
        }
    }
}
