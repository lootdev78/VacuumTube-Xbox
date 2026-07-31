using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Windows.Data.Json;

namespace VacuumTubeXbox.Services
{
    internal sealed class ModApiService : IDisposable
    {
        private readonly HttpClient _http = new HttpClient();
        private readonly ConcurrentDictionary<string, CacheEntry> _cache = new ConcurrentDictionary<string, CacheEntry>();
        private readonly SemaphoreSlim _requestGate = new SemaphoreSlim(6, 6);
        private bool _disposed;

        public ModApiService()
        {
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("VacuumTubeXbox/1.1 (+Xbox-DevMode; WebView2)");
        }

        private sealed class CacheEntry
        {
            public DateTimeOffset Time { get; set; }
            public IJsonValue Value { get; set; }
        }

        public async Task<IJsonValue> HandleAsync(string operation, JsonObject payload)
        {
            if (_disposed) throw new ObjectDisposedException(nameof(ModApiService));
            string videoId = payload?.GetNamedString("videoId", string.Empty) ?? string.Empty;
            if (operation == "dearrowBranding") return await GetJsonCachedAsync(
                "dearrow:" + ValidVideoId(videoId),
                "https://sponsor.ajay.app/api/branding?videoID=" + Uri.EscapeDataString(videoId),
                TimeSpan.FromHours(6));

            if (operation == "dislikes") return await GetJsonCachedAsync(
                "dislikes:" + ValidVideoId(videoId),
                "https://returnyoutubedislikeapi.com/votes?videoId=" + Uri.EscapeDataString(videoId),
                TimeSpan.FromMinutes(20));

            if (operation == "sponsorSegments")
            {
                string id = ValidVideoId(videoId);
                JsonArray categories = payload?.GetNamedArray("categories", new JsonArray()) ?? new JsonArray();
                List<string> safe = categories
                    .Where(value => value.ValueType == JsonValueType.String)
                    .Select(value => value.GetString())
                    .Where(value => !string.IsNullOrWhiteSpace(value))
                    .Take(8)
                    .ToList();
                if (safe.Count == 0) safe.Add("sponsor");
                JsonArray categoryValues = new JsonArray();
                foreach (string category in safe) categoryValues.Add(JsonValue.CreateStringValue(category));
                string categoryJson = categoryValues.Stringify();
                string url = "https://sponsor.ajay.app/api/skipSegments?videoID=" + Uri.EscapeDataString(id)
                    + "&categories=" + Uri.EscapeDataString(categoryJson);
                return await GetJsonCachedAsync("sponsor:" + id + ":" + string.Join(",", safe), url, TimeSpan.FromMinutes(30));
            }

            if (operation == "dearrowBatch")
            {
                JsonArray ids = payload?.GetNamedArray("videoIds", new JsonArray()) ?? new JsonArray();
                JsonObject branding = new JsonObject();
                JsonObject errors = new JsonObject();
                foreach (string id in ids.Where(v => v.ValueType == JsonValueType.String).Select(v => v.GetString()).Distinct().Take(36))
                {
                    try
                    {
                        ValidVideoId(id);
                        branding[id] = await GetJsonCachedAsync("dearrow:" + id,
                            "https://sponsor.ajay.app/api/branding?videoID=" + Uri.EscapeDataString(id), TimeSpan.FromHours(6));
                    }
                    catch (Exception error) { errors[id] = JsonValue.CreateStringValue(error.Message); }
                }
                return new JsonObject { ["branding"] = branding, ["errors"] = errors };
            }

            throw new InvalidOperationException("Unsupported API operation: " + operation);
        }

        private static string ValidVideoId(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length != 11 || value.Any(ch => !(char.IsLetterOrDigit(ch) || ch == '_' || ch == '-')))
                throw new ArgumentException("Invalid YouTube video ID");
            return value;
        }

        private async Task<IJsonValue> GetJsonCachedAsync(string key, string url, TimeSpan maxAge)
        {
            if (_cache.TryGetValue(key, out CacheEntry cached) && DateTimeOffset.UtcNow - cached.Time < maxAge) return cached.Value;
            await _requestGate.WaitAsync();
            try
            {
                if (_cache.TryGetValue(key, out cached) && DateTimeOffset.UtcNow - cached.Time < maxAge) return cached.Value;
                using (CancellationTokenSource timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8)))
                using (HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, url))
                {
                    request.Headers.Accept.ParseAdd("application/json");
                    using (HttpResponseMessage response = await _http.SendAsync(request, timeout.Token))
                    {
                        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return JsonValue.CreateNullValue();
                        if ((int)response.StatusCode == 429) throw new HttpRequestException("API rate limit reached; retry later");
                        response.EnsureSuccessStatusCode();
                        string text = await response.Content.ReadAsStringAsync();
                        IJsonValue value = ParseJson(text);
                        _cache[key] = new CacheEntry { Time = DateTimeOffset.UtcNow, Value = value };
                        TrimCache();
                        return value;
                    }
                }
            }
            finally
            {
                _requestGate.Release();
            }
        }

        private void TrimCache()
        {
            if (_cache.Count <= 600) return;
            foreach (KeyValuePair<string, CacheEntry> item in _cache.OrderBy(entry => entry.Value.Time).Take(_cache.Count - 500))
            {
                _cache.TryRemove(item.Key, out _);
            }
        }

        private static IJsonValue ParseJson(string text)
        {
            string value = (text ?? string.Empty).Trim();
            if (value.StartsWith("[")) return JsonArray.Parse(value);
            if (value.StartsWith("{")) return JsonObject.Parse(value);
            if (value == "null") return JsonValue.CreateNullValue();
            return JsonValue.CreateStringValue(value);
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _http.Dispose();
            _requestGate.Dispose();
            _cache.Clear();
        }
    }
}
