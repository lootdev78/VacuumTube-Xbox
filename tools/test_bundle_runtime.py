import subprocess, time, json, urllib.request, sys, tempfile, shutil, socket, os
import websocket
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOAK_SECONDS=max(0, int(os.environ.get('VT_SOAK_SECONDS', '0')))
HAR=Path(tempfile.mkdtemp(prefix='vacuumtube-runtime-test-'))
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    DEBUG_PORT = probe.getsockname()[1]
bundle=(ROOT/'VacuumTube.Xbox'/'Web'/'vacuumtube.bundle.js').read_text(encoding='utf-8')


def process_tree_rss_bytes(root_pid):
    """Best-effort Linux RSS total for Chromium and its child processes."""
    try:
        parents = {}
        rss = {}
        for proc in Path('/proc').iterdir():
            if not proc.name.isdigit():
                continue
            try:
                status = (proc / 'status').read_text(errors='ignore').splitlines()
                ppid = next(int(x.split()[1]) for x in status if x.startswith('PPid:'))
                kb = next(int(x.split()[1]) for x in status if x.startswith('VmRSS:'))
                pid = int(proc.name)
                parents[pid] = ppid
                rss[pid] = kb * 1024
            except Exception:
                pass
        descendants = {root_pid}
        changed = True
        while changed:
            changed = False
            for pid, ppid in parents.items():
                if ppid in descendants and pid not in descendants:
                    descendants.add(pid)
                    changed = True
        return sum(rss.get(pid, 0) for pid in descendants)
    except Exception:
        return 0
guard="if (location.host !== 'www.youtube.com' || location.pathname !== '/tv') return;"
if bundle.count(guard) != 1:
    raise RuntimeError('Expected exactly one YouTube location guard in bundle')
bundle=bundle.replace(guard, "/* disabled only in isolated runtime test */")
setup=r'''
(() => {
  window.__TEST_LOGS__=[]; window.__POSTS__=[]; window.__KEYDOWNS__=[]; window.__KEYUPS__=[];
  const stringify=x=>{try{if(x instanceof Error)return x.stack||x.message;return typeof x==='string'?x:JSON.stringify(x)}catch{return String(x)}};
  for (const k of ['error','warn']) { const orig=console[k].bind(console); console[k]=(...a)=>{window.__TEST_LOGS__.push({kind:k,text:a.map(stringify).join(' ')});orig(...a)} }
  addEventListener('error',e=>window.__TEST_LOGS__.push({kind:'window-error',text:[e.message,e.filename,e.lineno,e.colno].join(' ')}));
  addEventListener('unhandledrejection',e=>window.__TEST_LOGS__.push({kind:'unhandledrejection',text:stringify(e.reason?.stack||e.reason)}));
  window.__VACUUMTUBE_BOOTSTRAP_CONFIG__={volume:100,adblock:true,sponsorblock:true,sponsorblock_uuid:'test',dearrow:true,dislikes:true,remove_super_resolution:true,hide_shorts:true,unlock_resolution:true,h264ify:true,h264ify_disable_webm:true,h264ify_disable_vp8:true,h264ify_disable_vp9:true,h264ify_disable_av1:true,hardware_decoding:true,wayland_hdr:false,low_memory_mode:false,fullscreen:true,features_enabled:true,music_mode_feature:true,music_mode:true,no_window_decorations:true,keep_on_top:false,pause_on_blur:true,touch_overlay:true,controller_support:true,device_discoverability:true};
  window.__VACUUMTUBE_PLATFORM__={deviceFamily:'Windows.Xbox',deviceName:'Xbox Test',model:'Xbox Series X',userAgentModel:'Xbox Series X',manufacturer:'Microsoft',osVersion:'10.0.26100',webViewVersion:'144.0.0.0'};
  window.ytcfg={data_:{HL:'en',INNERTUBE_CLIENT_NAME:'TVHTML5',INNERTUBE_CONTEXT:{client:{clientName:'TVHTML5'}}},set(v){this.data_=v},get(k){return this.data_[k]}};
  history.replaceState=()=>{}; window.environment={}; window.tectonicConfig={}; window._yttv={test:{instance:{resolveCommand:x=>x}}};
  window.__WEBVIEW_HANDLERS__=[];
  window.chrome=window.chrome||{};
  window.chrome.webview={
    addEventListener(type,cb){if(type==='message')window.__WEBVIEW_HANDLERS__.push(cb)},
    postMessage(msg){
      window.__POSTS__.push(msg);
      let result=true; const channel=msg.channel;
      if(channel==='get-deeplink') result=null;
      else if(channel==='http-request') {
        const url=msg.args?.[0]?.url||'';
        if(url.includes('/skipSegments/')) result={status:200,statusText:'OK',headers:{},body:'[]'};
        else if(url.includes('/branding')) result={status:404,statusText:'Not Found',headers:{},body:''};
        else if(url.includes('returnyoutubedislike')) result={status:200,statusText:'OK',headers:{},body:'{"dislikes":42}'};
        else result={status:200,statusText:'OK',headers:{},body:'{}'};
      }
      if(msg.id>0) queueMicrotask(()=>window.__WEBVIEW_HANDLERS__.forEach(cb=>cb({data:{type:'reply',id:msg.id,result}})));
    }
  };
  navigator.mediaDevices=navigator.mediaDevices||{}; navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[]});
  navigator.clipboard=navigator.clipboard||{writeText:async()=>{}};
  Object.defineProperty(navigator,'getGamepads',{value:()=>[],configurable:true});
  class FakeXHR {
    constructor(){this.readyState=0;this.responseType='';this.responseText='';this.response='';this._events={};}
    open(method,url){this.method=method;this.url=url;this.readyState=1;}
    addEventListener(type,cb){(this._events[type]||(this._events[type]=[])).push(cb)}
    send(body){this.body=body; setTimeout(()=>{this.responseText=JSON.stringify({contents:{tvBrowseRenderer:{content:{tvSurfaceContentRenderer:{content:{sectionListRenderer:{contents:[{adSlotRenderer:{}},{shelfRenderer:{content:{horizontalListRenderer:{items:[{adSlotRenderer:{}},{videoRenderer:{videoId:'ok'}}]}}}}]}}}}}},adPlacements:[1],adSlots:[2]});this.response=this.responseText;this.readyState=4;(this._events.readystatechange||[]).forEach(f=>f.call(this));(this._events.load||[]).forEach(f=>f.call(this));},0)}
  }
  window.XMLHttpRequest=FakeXHR;
  document.body.innerHTML='<div class="html5-video-player" id="player"></div><video></video><ytlr-app></ytlr-app><div id="content"></div>';
  const player=document.getElementById('player'); Object.assign(player,{getPlayerState:()=>1,pauseVideo(){},playVideo(){},getVideoData:()=>({video_id:'abc'}),getPlaybackQuality:()=> 'hd1080',setPlaybackQualityRange(){},seekBy(){},isMuted:()=>false,mute(){},unMute(){},getVolume:()=>100,setVolume(){}});
  document.addEventListener('keydown',e=>window.__KEYDOWNS__.push(e.keyCode)); document.addEventListener('keyup',e=>window.__KEYUPS__.push(e.keyCode));
})();
'''
chrome=subprocess.Popen(['chromium','--headless','--no-sandbox','--disable-gpu',f'--remote-debugging-port={DEBUG_PORT}','--remote-allow-origins=*','--user-data-dir='+str(HAR/'chrome-profile'),'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
    target=None
    for _ in range(100):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/list',timeout=1) as r: targets=json.load(r)
            target=next((t for t in targets if t.get('type')=='page'),None)
            if target: break
        except Exception: pass
        time.sleep(.1)
    if not target: raise RuntimeError('No Chrome page target')
    ws=websocket.create_connection(target['webSocketDebuggerUrl'],timeout=10)
    seq=0
    def cmd(method,params=None):
        nonlocal_dummy=None
        global seq
        seq+=1; i=seq; ws.send(json.dumps({'id':i,'method':method,'params':params or {}}))
        while True:
            msg=json.loads(ws.recv())
            if msg.get('id')==i:return msg
    def evaljs(expr,awaitPromise=False):
        out=cmd('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':awaitPromise,'userGesture':True})
        if 'exceptionDetails' in out.get('result',{}): raise RuntimeError(json.dumps(out['result']['exceptionDetails']))
        return out.get('result',{}).get('result',{}).get('value')
    cmd('Runtime.enable'); evaljs(setup); evaljs(bundle+'\n//# sourceURL=vacuumtube.bundle.js')
    evaljs("window.dispatchEvent(new Event('load'))"); time.sleep(2.2)
    # Native Xbox gamepad events -> full button mapping and settings shortcut.
    expected_keycodes = [13, 27, 170, 32, 115, 116, 113, 114, 189, 187, 77, 38, 40, 37, 39]
    for button_index in list(range(11)) + list(range(12, 16)):
        buttons = [0] * 16
        buttons[button_index] = 1
        state = {'id':'Xbox','index':0,'connected':True,'mapping':'standard','buttons':buttons,'axes':[0,0,0,0]}
        evaljs('window.__WEBVIEW_HANDLERS__.forEach(cb=>cb({data:'+json.dumps({'type':'event','channel':'xbox-gamepad-state','args':[state]})+'}))')
        time.sleep(.04)
        state['buttons'] = [0] * 16
        evaljs('window.__WEBVIEW_HANDLERS__.forEach(cb=>cb({data:'+json.dumps({'type':'event','channel':'xbox-gamepad-state','args':[state]})+'}))')
        time.sleep(.04)
    # Right-thumb click opens the native-friendly settings overlay.
    settings_before = evaljs("document.querySelector('#vt-settings-overlay-root').classList.contains('vt-settings-hidden')")
    buttons = [0] * 16; buttons[11] = 1
    state = {'id':'Xbox','index':0,'connected':True,'mapping':'standard','buttons':buttons,'axes':[0,0,0,0]}
    evaljs('window.__WEBVIEW_HANDLERS__.forEach(cb=>cb({data:'+json.dumps({'type':'event','channel':'xbox-gamepad-state','args':[state]})+'}))')
    time.sleep(.06)
    settings_after = evaljs("document.querySelector('#vt-settings-overlay-root').classList.contains('vt-settings-hidden')")
    # XHR modifier smoke test
    xhr_result=evaljs("new Promise(resolve=>{const x=new XMLHttpRequest();x.open('POST','/youtubei/v1/browse');x.onload=()=>resolve(x.responseText);x.send('{}')})",True)
    identity_request=evaljs("(async()=>{const x=new XMLHttpRequest();await x.open('POST','/youtubei/v1/account/account_menu');await x.send(JSON.stringify({context:{client:{visitorData:'visitor-keep'},user:{delegatedSessionId:'session-keep'}}}));return JSON.parse(x.body)})()",True)
    # JSON mods smoke test
    jsonmods=evaljs("(()=>{let p=JSON.parse('{\"adPlacements\":[1],\"adSlots\":[2],\"entries\":[{\"command\":{\"reelWatchEndpoint\":{\"adClientParams\":{\"isAd\":true}}}},{\"ok\":1}],\"streamingData\":{\"adaptiveFormats\":[{\"xtags\":\"CgcKAnNyEgEx\"},{\"xtags\":\"ok\"}]}}');return p.adPlacements.length===0&&p.adSlots.length===0&&p.entries.length===1&&p.streamingData.adaptiveFormats.length===1})()")

    soak = None
    if SOAK_SECONDS:
        samples = []
        start = time.monotonic()
        while time.monotonic() - start < SOAK_SECONDS:
            evaljs("(()=>{const p=JSON.parse('{\"adPlacements\":[1],\"adSlots\":[2]}'); return p.adPlacements.length===0 && p.adSlots.length===0})()")
            evaljs("window.dispatchEvent(new Event('resize')); true")
            samples.append(process_tree_rss_bytes(chrome.pid))
            time.sleep(min(2.0, max(0.1, SOAK_SECONDS / 20)))
        final_logs = evaljs("window.__TEST_LOGS__")
        nonzero = [value for value in samples if value > 0]
        soak = {
            'seconds': SOAK_SECONDS,
            'samples': len(samples),
            'rssStartBytes': nonzero[0] if nonzero else 0,
            'rssMaxBytes': max(nonzero) if nonzero else 0,
            'rssEndBytes': nonzero[-1] if nonzero else 0,
            'consoleErrors': final_logs
        }

    result=evaljs('''JSON.stringify({loaded:!!window.__VACUUMTUBE_XBOX_LOADED__,settingsOverlay:!!document.querySelector("#vt-settings-overlay-root"),settingsParentIsBody:document.querySelector("#vt-settings-overlay-root")?.parentElement===document.body,hasUserstylesTab:!!document.querySelector('.vt-tab[data-tab="userstyles"]'),styleCount:document.querySelectorAll("style").length,webp:window.ytcfg?.data_?.INNERTUBE_CONTEXT?.client?.webpSupport===true,xboxIdentity:window.ytcfg?.data_?.INNERTUBE_CONTEXT?.client,directSignInDisabled:window.tectonicConfig?.featureSwitches?.enableDirectSignIn===false,h5vcc:!!window.h5vcc?.dial?.DialServer,controllerA:window.__KEYDOWNS__.includes(13),controllerMap:window.__KEYDOWNS__,controllerUps:window.__KEYUPS__,posts:window.__POSTS__.map(x=>x.channel),logs:window.__TEST_LOGS__})''')
    data=json.loads(result); data['jsonMods']=bool(jsonmods); data['xhrResult']=json.loads(xhr_result); data['identityRequest']=identity_request; data['soak']=soak
    # Analyze XHR transformed content
    contents=data['xhrResult']['contents']['tvBrowseRenderer']['content']['tvSurfaceContentRenderer']['content']['sectionListRenderer']['contents']
    data['xhrAdblock']=len(contents)==1 and len(contents[0]['shelfRenderer']['content']['horizontalListRenderer']['items'])==1
    
    required = {
      'loaded': data.get('loaded') is True,
      'settingsOverlay': data.get('settingsOverlay') is True,
      'settingsOnOriginalPage': data.get('settingsParentIsBody') is True,
      'noUserstylesTab': data.get('hasUserstylesTab') is False,
      'styles': data.get('styleCount', 0) >= 3,
      'webp': data.get('webp') is True,
      'xboxIdentity': data.get('xboxIdentity', {}).get('platformDetail') == 'XBOX' and data.get('xboxIdentity', {}).get('deviceMake') == 'Microsoft' and data.get('xboxIdentity', {}).get('deviceModel') == 'Xbox Series X' and data.get('xboxIdentity', {}).get('browserName') == 'Edge',
      'directSignInOriginal': data.get('directSignInDisabled') is True,
      'accountTokensPreserved': data.get('identityRequest', {}).get('context', {}).get('client', {}).get('visitorData') == 'visitor-keep' and data.get('identityRequest', {}).get('context', {}).get('user', {}).get('delegatedSessionId') == 'session-keep',
      'h5vcc': data.get('h5vcc') is True,
      'controllerA': data.get('controllerA') is True,
      'controllerMap': data.get('controllerMap') == expected_keycodes,
      'controllerUps': data.get('controllerUps') == expected_keycodes,
      'settingsShortcut': settings_before is True and settings_after is False,
      'jsonMods': data.get('jsonMods') is True,
      'xhrAdblock': data.get('xhrAdblock') is True,
      'console': data.get('logs') == [],
      'soakConsole': soak is None or soak.get('consoleErrors') == []
    }
    data['checks'] = required
    print(json.dumps(data,indent=2))
    if not all(required.values()):
        raise RuntimeError('Runtime checks failed: ' + ', '.join(k for k,v in required.items() if not v))
finally:
    try: chrome.terminate(); chrome.wait(timeout=5)
    except: chrome.kill()
    shutil.rmtree(HAR, ignore_errors=True)
