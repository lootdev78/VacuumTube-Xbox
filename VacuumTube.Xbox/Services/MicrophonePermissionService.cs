using System;
using System.Threading.Tasks;
using Windows.Devices.Enumeration;
using Windows.Media.Capture;

namespace VacuumTube.Xbox.Services
{
    internal sealed class MicrophonePermissionService
    {
        private bool _successfulInitialization;

        public string GetStatus()
        {
            try
            {
                var access = DeviceAccessInformation.CreateFromDeviceClass(DeviceClass.AudioCapture);
                switch (access.CurrentStatus)
                {
                    case DeviceAccessStatus.Allowed:
                        return "granted";
                    case DeviceAccessStatus.DeniedByUser:
                        return "denied";
                    case DeviceAccessStatus.DeniedBySystem:
                        return "restricted";
                    default:
                        return _successfulInitialization ? "granted" : "not-determined";
                }
            }
            catch
            {
                return _successfulInitialization ? "granted" : "unknown";
            }
        }

        public async Task<string> RequestAsync()
        {
            var current = GetStatus();
            if (current == "granted" || current == "denied" || current == "restricted") return current;

            try
            {
                using (var capture = new MediaCapture())
                {
                    await capture.InitializeAsync(new MediaCaptureInitializationSettings
                    {
                        StreamingCaptureMode = StreamingCaptureMode.Audio
                    });
                }
                _successfulInitialization = true;
                return "granted";
            }
            catch (UnauthorizedAccessException)
            {
                return "denied";
            }
            catch (Exception error)
            {
                System.Diagnostics.Debug.WriteLine("Microphone permission request failed: " + error);
                return GetStatus() == "not-determined" ? "unknown" : GetStatus();
            }
        }

        // UWP apps cannot reset the user's privacy decision programmatically.
        public string Reset() => "unsupported";
    }
}
