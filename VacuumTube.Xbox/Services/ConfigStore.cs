using System;
using Newtonsoft.Json.Linq;
using Windows.Storage;

namespace VacuumTube.Xbox.Services
{
    internal sealed class ConfigStore
    {
        private const string SettingsKey = "VacuumTubeConfig";
        private readonly ApplicationDataContainer _settings = ApplicationData.Current.LocalSettings;

        public JObject Current { get; private set; }

        public ConfigStore()
        {
            Current = CreateDefaults();
            if (_settings.Values.TryGetValue(SettingsKey, out var raw) && raw is string json)
            {
                try { Current.Merge(JObject.Parse(json), new JsonMergeSettings { MergeArrayHandling = MergeArrayHandling.Replace }); }
                catch { }
            }
            Save();
        }

        public JObject Update(JObject values)
        {
            if (values != null)
            {
                Current.Merge(values, new JsonMergeSettings { MergeArrayHandling = MergeArrayHandling.Replace });
                Save();
            }
            return (JObject)Current.DeepClone();
        }

        private void Save() => _settings.Values[SettingsKey] = Current.ToString(Newtonsoft.Json.Formatting.None);

        private static JObject CreateDefaults() => JObject.Parse(@"{
          'volume': 100,
          'adblock': true,
          'sponsorblock': false,
          'sponsorblock_uuid': '" + Guid.NewGuid() + @"',
          'dearrow': false,
          'dislikes': false,
          'remove_super_resolution': false,
          'hide_shorts': false,
          'unlock_resolution': true,
          'h264ify': false,
          'h264ify_disable_webm': true,
          'h264ify_disable_vp8': true,
          'h264ify_disable_vp9': true,
          'h264ify_disable_av1': true,
          'hardware_decoding': true,
          'wayland_hdr': false,
          'low_memory_mode': false,
          'fullscreen': true,
          'features_enabled': false,
          'music_mode_feature': false,
          'music_mode': false,
          'no_window_decorations': true,
          'keep_on_top': false,
          'pause_on_blur': false,
          'touch_overlay': false,
          'controller_support': true,
          'device_discoverability': true
        }");
    }
}
