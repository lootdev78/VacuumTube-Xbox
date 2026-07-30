using System;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Windows.Gaming.Input;
using Windows.UI.Xaml;

namespace VacuumTube.Xbox.Services
{
    internal sealed class XboxGamepadBridge
    {
        private readonly DispatcherTimer _timer;
        private readonly Action<JObject> _sendState;
        private string _lastState;

        public XboxGamepadBridge(Action<JObject> sendState)
        {
            _sendState = sendState;
            _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
            _timer.Tick += Tick;
        }

        public void Start() => _timer.Start();
        public void Stop() => _timer.Stop();

        private void Tick(object sender, object e)
        {
            var gamepad = Gamepad.Gamepads.FirstOrDefault();
            if (gamepad == null)
            {
                if (_lastState != null)
                {
                    _lastState = null;
                    _sendState(null);
                }
                return;
            }

            var reading = gamepad.GetCurrentReading();
            bool Has(GamepadButtons value) => (reading.Buttons & value) == value;

            var buttons = new JArray
            {
                Has(GamepadButtons.A) ? 1.0 : 0.0,
                Has(GamepadButtons.B) ? 1.0 : 0.0,
                Has(GamepadButtons.X) ? 1.0 : 0.0,
                Has(GamepadButtons.Y) ? 1.0 : 0.0,
                Has(GamepadButtons.LeftShoulder) ? 1.0 : 0.0,
                Has(GamepadButtons.RightShoulder) ? 1.0 : 0.0,
                reading.LeftTrigger,
                reading.RightTrigger,
                Has(GamepadButtons.View) ? 1.0 : 0.0,
                Has(GamepadButtons.Menu) ? 1.0 : 0.0,
                Has(GamepadButtons.LeftThumbstick) ? 1.0 : 0.0,
                Has(GamepadButtons.RightThumbstick) ? 1.0 : 0.0,
                Has(GamepadButtons.DPadUp) ? 1.0 : 0.0,
                Has(GamepadButtons.DPadDown) ? 1.0 : 0.0,
                Has(GamepadButtons.DPadLeft) ? 1.0 : 0.0,
                Has(GamepadButtons.DPadRight) ? 1.0 : 0.0
            };

            var state = new JObject
            {
                ["id"] = "Xbox Controller (Windows.Gaming.Input)",
                ["index"] = 0,
                ["connected"] = true,
                ["mapping"] = "standard",
                ["buttons"] = buttons,
                ["axes"] = new JArray(reading.LeftThumbstickX, -reading.LeftThumbstickY, reading.RightThumbstickX, -reading.RightThumbstickY)
            };

            var serialized = state.ToString(Formatting.None);
            if (serialized == _lastState) return;
            _lastState = serialized;
            _sendState(state);
        }
    }
}
