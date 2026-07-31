using System;
using Windows.System.Display;

namespace VacuumTubeXbox.Services
{
    internal sealed class DisplayRequestService : IDisposable
    {
        private readonly DisplayRequest _displayRequest = new DisplayRequest();
        private bool _active;
        private bool _disposed;

        public bool IsActive => _active;

        public void SetActive(bool active)
        {
            if (_disposed || active == _active) return;
            try
            {
                if (active) _displayRequest.RequestActive();
                else _displayRequest.RequestRelease();
                _active = active;
            }
            catch (Exception error)
            {
                System.Diagnostics.Debug.WriteLine("Display request failed: " + error.Message);
            }
        }

        public void Dispose()
        {
            if (_disposed) return;
            if (_active)
            {
                try { _displayRequest.RequestRelease(); }
                catch { }
            }
            _active = false;
            _disposed = true;
        }
    }
}
