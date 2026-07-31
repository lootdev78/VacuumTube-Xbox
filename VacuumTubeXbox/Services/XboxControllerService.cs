using System;
using System.Collections.Generic;
using Microsoft.UI.Xaml.Controls;
using Windows.Data.Json;
using Windows.Gaming.Input;
using Windows.UI.Xaml;

namespace VacuumTubeXbox.Services
{
    internal sealed class XboxControllerService : IDisposable
    {
        private readonly WebView2 _webView;
        private readonly DispatcherTimer _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(33) };
        private readonly Dictionary<string, ButtonState> _states = new Dictionary<string, ButtonState>();
        private int _lastCount = -1;
        private bool _disposed;

        private sealed class ButtonState
        {
            public bool Pressed;
            public DateTimeOffset NextRepeat;
            public DateTimeOffset PressedAt;
            public bool LongSent;
        }

        public XboxControllerService(WebView2 webView)
        {
            _webView = webView;
            _timer.Tick += OnTick;
        }

        public void Start()
        {
            if (_disposed) throw new ObjectDisposedException(nameof(XboxControllerService));
            _timer.Start();
        }

        private void OnTick(object sender, object e)
        {
            if (_disposed || _webView.CoreWebView2 == null) return;
            IReadOnlyList<Gamepad> pads = Gamepad.Gamepads;
            if (pads.Count != _lastCount)
            {
                _lastCount = pads.Count;
                Post(new JsonObject
                {
                    ["type"] = JsonValue.CreateStringValue("xboxControllerStatus"),
                    ["connected"] = JsonValue.CreateBooleanValue(pads.Count > 0),
                    ["count"] = JsonValue.CreateNumberValue(pads.Count)
                });
            }
            if (pads.Count == 0) return;
            GamepadReading reading = pads[0].GetCurrentReading();
            DateTimeOffset now = DateTimeOffset.UtcNow;

            CheckConfirm(Has(reading.Buttons, GamepadButtons.A), now);
            Check("back", Has(reading.Buttons, GamepadButtons.B), false, now);
            Check("up", Has(reading.Buttons, GamepadButtons.DPadUp) || reading.LeftThumbstickY > 0.62, true, now);
            Check("down", Has(reading.Buttons, GamepadButtons.DPadDown) || reading.LeftThumbstickY < -0.62, true, now);
            Check("left", Has(reading.Buttons, GamepadButtons.DPadLeft) || reading.LeftThumbstickX < -0.62, true, now);
            Check("right", Has(reading.Buttons, GamepadButtons.DPadRight) || reading.LeftThumbstickX > 0.62, true, now);
            Check("previousTab", Has(reading.Buttons, GamepadButtons.LeftShoulder), false, now);
            Check("nextTab", Has(reading.Buttons, GamepadButtons.RightShoulder), false, now);
            Check("openYouTubeSettings", Has(reading.Buttons, GamepadButtons.Menu), false, now);
            Check("playPause", Has(reading.Buttons, GamepadButtons.X), false, now);
            Check("captions", Has(reading.Buttons, GamepadButtons.Y), false, now);
            Check("queueNext", Has(reading.Buttons, GamepadButtons.View), false, now);
            Check("speed", Has(reading.Buttons, GamepadButtons.RightThumbstick), false, now);
            Check("volumeDown", reading.LeftTrigger > 0.72, true, now);
            Check("volumeUp", reading.RightTrigger > 0.72, true, now);
        }


        private void CheckConfirm(bool pressed, DateTimeOffset now)
        {
            const string action = "confirm";
            if (!_states.TryGetValue(action, out ButtonState state))
            {
                state = new ButtonState();
                _states[action] = state;
            }

            if (pressed && !state.Pressed)
            {
                state.PressedAt = now;
                state.LongSent = false;
            }
            else if (pressed && state.Pressed && !state.LongSent
                && now - state.PressedAt >= TimeSpan.FromMilliseconds(650))
            {
                SendAction("longPress");
                state.LongSent = true;
            }
            else if (!pressed && state.Pressed && !state.LongSent)
            {
                SendAction("confirm");
            }

            state.Pressed = pressed;
        }

        private void Check(string action, bool pressed, bool repeatable, DateTimeOffset now)
        {
            if (!_states.TryGetValue(action, out ButtonState state))
            {
                state = new ButtonState();
                _states[action] = state;
            }
            if (pressed && !state.Pressed)
            {
                SendAction(action);
                state.NextRepeat = now.AddMilliseconds(360);
            }
            else if (pressed && repeatable && now >= state.NextRepeat)
            {
                SendAction(action);
                state.NextRepeat = now.AddMilliseconds(115);
            }
            state.Pressed = pressed;
        }

        private void SendAction(string action)
        {
            Post(new JsonObject
            {
                ["type"] = JsonValue.CreateStringValue("xboxController"),
                ["action"] = JsonValue.CreateStringValue(action)
            });
        }

        private void Post(JsonObject message)
        {
            if (_disposed || message == null) return;
            try { _webView.CoreWebView2?.PostWebMessageAsJson(message.Stringify()); }
            catch (Exception error) { System.Diagnostics.Debug.WriteLine("Xbox controller message failed: " + error.Message); }
        }
        private static bool Has(GamepadButtons value, GamepadButtons button) => (value & button) == button;

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _timer.Stop();
            _timer.Tick -= OnTick;
            _states.Clear();
        }
    }
}
