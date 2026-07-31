using System;
using Windows.ApplicationModel;
using Windows.ApplicationModel.Activation;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace VacuumTubeXbox
{
    sealed partial class App : Application
    {
        public App()
        {
            InitializeComponent();
            Suspending += OnSuspending;
            Resuming += OnResuming;
            UnhandledException += OnUnhandledException;
        }

        protected override void OnLaunched(LaunchActivatedEventArgs e)
        {
            ApplicationView.PreferredLaunchWindowingMode = ApplicationViewWindowingMode.FullScreen;

            Frame rootFrame = Window.Current.Content as Frame;
            if (rootFrame == null)
            {
                rootFrame = new Frame();
                rootFrame.NavigationFailed += OnNavigationFailed;
                Window.Current.Content = rootFrame;
            }

            if (rootFrame.Content == null)
            {
                rootFrame.Navigate(typeof(MainPage), e.Arguments ?? string.Empty);
            }

            Window.Current.Activate();
        }

        private static void OnNavigationFailed(object sender, NavigationFailedEventArgs e)
        {
            throw new InvalidOperationException("Failed to load page " + e.SourcePageType.FullName, e.Exception);
        }

        private async void OnSuspending(object sender, SuspendingEventArgs e)
        {
            SuspendingDeferral deferral = e.SuspendingOperation.GetDeferral();
            try
            {
                Frame frame = Window.Current.Content as Frame;
                MainPage page = frame?.Content as MainPage;
                if (page != null) await page.NotifyLifecycleAsync("suspending");
            }
            finally
            {
                deferral.Complete();
            }
        }

        private async void OnResuming(object sender, object e)
        {
            Frame frame = Window.Current.Content as Frame;
            MainPage page = frame?.Content as MainPage;
            if (page != null) await page.NotifyLifecycleAsync("resumed");
        }

        private static void OnUnhandledException(object sender, Windows.UI.Xaml.UnhandledExceptionEventArgs e)
        {
            System.Diagnostics.Debug.WriteLine("VacuumTube Xbox unhandled exception: " + e.Exception);
        }
    }

}