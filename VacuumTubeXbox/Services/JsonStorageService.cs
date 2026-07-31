using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Windows.Data.Json;
using Windows.Storage;

namespace VacuumTubeXbox.Services
{
    internal sealed class JsonStorageService
    {
        private readonly StorageFolder _folder = ApplicationData.Current.LocalFolder;
        private readonly SemaphoreSlim _gate = new SemaphoreSlim(1, 1);

        private static string FileName(string area) => area == "local" ? "extension-storage-local.json" : "extension-storage-sync.json";

        public async Task<JsonObject> GetAreaAsync(string area)
        {
            await _gate.WaitAsync();
            try { return await ReadUnlockedAsync(area); }
            finally { _gate.Release(); }
        }

        public async Task SetAsync(string area, JsonObject items)
        {
            await _gate.WaitAsync();
            try
            {
                JsonObject root = await ReadUnlockedAsync(area);
                foreach (KeyValuePair<string, IJsonValue> item in items)
                {
                    root[item.Key] = item.Value ?? JsonValue.CreateNullValue();
                }
                await WriteUnlockedAsync(area, root);
            }
            finally { _gate.Release(); }
        }

        public async Task RemoveAsync(string area, JsonArray keys)
        {
            await _gate.WaitAsync();
            try
            {
                JsonObject root = await ReadUnlockedAsync(area);
                foreach (IJsonValue value in keys)
                {
                    if (value.ValueType == JsonValueType.String) root.Remove(value.GetString());
                }
                await WriteUnlockedAsync(area, root);
            }
            finally { _gate.Release(); }
        }

        public async Task ClearAsync(string area)
        {
            await _gate.WaitAsync();
            try { await WriteUnlockedAsync(area, new JsonObject()); }
            finally { _gate.Release(); }
        }

        public async Task PurgeDiagnosticLogsAsync()
        {
            const string logKey = "vtwDiagnosticsLogs";
            long cutoff = DateTimeOffset.UtcNow.AddDays(-3).ToUnixTimeMilliseconds();
            await _gate.WaitAsync();
            try
            {
                JsonObject local = await ReadUnlockedAsync("local");
                if (!local.TryGetValue(logKey, out IJsonValue raw) || raw.ValueType != JsonValueType.Array) return;
                JsonArray next = new JsonArray();
                JsonArray logs = raw.GetArray();
                int start = Math.Max(0, logs.Count - 400);
                for (int i = start; i < logs.Count; i++)
                {
                    IJsonValue entry = logs[i];
                    if (entry.ValueType != JsonValueType.Object) continue;
                    JsonObject item = entry.GetObject();
                    double timestamp = item.GetNamedNumber("timestamp", 0);
                    if (timestamp >= cutoff) next.Add(item);
                }
                local[logKey] = next;
                await WriteUnlockedAsync("local", local);
            }
            finally { _gate.Release(); }
        }

        private async Task<JsonObject> ReadUnlockedAsync(string area)
        {
            try
            {
                IStorageItem item = await _folder.TryGetItemAsync(FileName(area));
                if (!(item is StorageFile file)) return new JsonObject();
                string text = await FileIO.ReadTextAsync(file);
                return string.IsNullOrWhiteSpace(text) ? new JsonObject() : JsonObject.Parse(text);
            }
            catch { return new JsonObject(); }
        }

        private async Task WriteUnlockedAsync(string area, JsonObject value)
        {
            StorageFile file = await _folder.CreateFileAsync(FileName(area), CreationCollisionOption.ReplaceExisting);
            await FileIO.WriteTextAsync(file, value.Stringify());
        }
    }
}
