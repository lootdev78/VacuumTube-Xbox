using System;
using Windows.ApplicationModel.Activation;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace VacuumTube.Xbox
{
    sealed partial class App : Application
    {
        internal static string PendingDeepLink { get; private set; }

        public App()
        {
            InitializeComponent();
            Suspending += OnSuspending;
            Resuming += OnResuming;
        }

        protected override void OnLaunched(LaunchActivatedEventArgs e)
        {
            PendingDeepLink = string.IsNullOrWhiteSpace(e.Arguments) ? null : e.Arguments;
            OpenMainPage(e.PrelaunchActivated);
        }

        protected override void OnActivated(IActivatedEventArgs args)
        {
            if (args is ProtocolActivatedEventArgs protocol)
            {
                PendingDeepLink = protocol.Uri?.ToString();
            }
            OpenMainPage(false);
        }

        private static void OpenMainPage(bool prelaunch)
        {
            var frame = Window.Current.Content as Frame;
            if (frame == null)
            {
                frame = new Frame();
                frame.NavigationFailed += OnNavigationFailed;
                Window.Current.Content = frame;
            }

            if (!prelaunch && frame.Content == null)
            {
                frame.Navigate(typeof(MainPage));
            }
            Window.Current.Activate();
        }

        private static void OnNavigationFailed(object sender, NavigationFailedEventArgs e)
        {
            throw new Exception("Failed to load " + e.SourcePageType.FullName);
        }

        private async void OnSuspending(object sender, Windows.ApplicationModel.SuspendingEventArgs e)
        {
            var deferral = e.SuspendingOperation.GetDeferral();
            try
            {
                if (Window.Current.Content is Frame frame && frame.Content is MainPage page)
                    await page.SuspendAsync();
            }
            finally
            {
                deferral.Complete();
            }
        }

        private async void OnResuming(object sender, object e)
        {
            if (Window.Current.Content is Frame frame && frame.Content is MainPage page)
                await page.ResumeAsync();
        }
    }
}
