using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.UI.Xaml.Controls;
using Windows.Data.Json;
using Windows.Storage;

namespace VacuumTubeXbox.Services
{
    internal sealed class ExtensionRuntimeService
    {
        private readonly WebView2 _webView;
        private bool _registered;

        private static readonly string[] ScriptOrder =
        {
            "xbox-extension-shim.js",
            "content/bridge.js",
            "page/core.js",
            "page/network.js",
            "page/platform.js",
            "page/mods-content.js",
            "page/mods-player.js",
            "page/upstream-content.js",
            "page/upstream-player.js",
            "page/player-ui.js",
            "page/navigation.js",
            "page/settings.js",
            "xbox-extras.js"
        };

        public ExtensionRuntimeService(WebView2 webView) { _webView = webView; }

        public async Task RegisterAsync()
        {
            if (_registered) return;
            if (_webView.CoreWebView2 == null) throw new InvalidOperationException("CoreWebView2 is not initialized");

            string css = await ReadPackagedTextAsync("page/base.css") + "\n" + await ReadPackagedTextAsync("xbox.css");
            string cssLiteral = JsonValue.CreateStringValue(css).Stringify();
            string cssBootstrap = "(() => { const install=()=>{ if(document.getElementById('vt-xbox-runtime-style'))return; const s=document.createElement('style'); s.id='vt-xbox-runtime-style'; s.textContent=" + cssLiteral + "; (document.head||document.documentElement).appendChild(s); }; if(document.documentElement)install(); else addEventListener('readystatechange',install,{once:true}); })();";
            await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(cssBootstrap);

            foreach (string relativePath in ScriptOrder)
            {
                string script = await ReadPackagedTextAsync(relativePath);
                await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(script + "\n//# sourceURL=ms-appx:///Assets/ExtensionRuntime/" + relativePath);
            }
            _registered = true;
        }

        private static async Task<string> ReadPackagedTextAsync(string relativePath)
        {
            Uri uri = new Uri("ms-appx:///Assets/ExtensionRuntime/" + relativePath.Replace("\\", "/"));
            StorageFile file = await StorageFile.GetFileFromApplicationUriAsync(uri);
            return await FileIO.ReadTextAsync(file);
        }
    }
}
