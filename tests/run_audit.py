"""Run the browser audit against a repository-style URL, without dependencies.
Usage: python tests/run_audit.py [--chrome PATH] [--all]
The runner creates/removes a temporary fixture and never edits model data.
"""
from pathlib import Path
import argparse, functools, hashlib, html, http.server, json, re, shutil
import subprocess, tempfile, threading, urllib.request
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--chrome', default=shutil.which('google-chrome') or shutil.which('chromium') or 'C:/Program Files/Google/Chrome/Application/chrome.exe')
parser.add_argument('--all', action='store_true', help='Also test narrow light/dark layouts and failed data loading')
args = parser.parse_args()
protected = [ROOT/'m10.js', *sorted((ROOT/'outputs').glob('*'))]
hashes = {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT.parent)))
threading.Thread(target=server.serve_forever, daemon=True).start()
fixture = ROOT/'_audit_browser.html'
bootstrap = '''<script>
window.auditErrors=[];window.auditConsole=[];window.auditRequests=[];
addEventListener('error',e=>auditErrors.push(e.message||'resource failure: '+e.target?.src),true);
addEventListener('unhandledrejection',e=>auditErrors.push(String(e.reason)));
const oldError=console.error;console.error=(...args)=>{auditConsole.push(args.map(String).join(' '));oldError(...args);};
const nativeFetch=window.fetch.bind(window);
window.fetch=async(...args)=>{
 const path=String(args[0]), mode=new URLSearchParams(location.search).get('mode');
 if(mode==='missing'&&path.includes('outputs/'))throw new Error('Intentional audit network failure');
 const response=await nativeFetch(...args);auditRequests.push({path,ok:response.ok,status:response.status});
 if(path==='outputs/glucose.json')await new Promise(r=>setTimeout(r,200));
 else if(path==='outputs/fev1.json')await new Promise(r=>setTimeout(r,100));
 else if(path==='outputs/sbp.json')await new Promise(r=>setTimeout(r,20));
 return response;
};
</script>'''
try:
    source=(ROOT/'index.html').read_text(encoding='utf-8')
    source=source.replace('</head>',bootstrap+'</head>').replace('</body>','<script type="module" src="tests/audit.js"></script></body>')
    fixture.write_text(source,encoding='utf-8')
    url=f'http://127.0.0.1:{server.server_port}/{quote(ROOT.name)}/_audit_browser.html'
    assets=['index.html','app.js','m10.js','styles.css']+[str(p.relative_to(ROOT)).replace('\\','/') for p in (ROOT/'outputs').glob('*.json')]
    base=url.rsplit('/',1)[0]+'/'
    for asset in assets:
        with urllib.request.urlopen(base+asset) as response:
            assert response.status==200, asset
            if asset.endswith('.json'): json.load(response)
    print(f'HTTP 200 and valid JSON where applicable: {len(assets)} assets under repository subpath.',flush=True)
    variants=[('desktop',1440,False,'')]
    if args.all:variants += [('narrow',500,False,''),('narrow-dark',500,True,''),('failed-load',1000,False,'?mode=missing'),('direct-forest',1000,False,'?mode=direct#forest'),('direct-boosting',1000,False,'?mode=direct#boosting')]
    results=[]
    for name,width,dark,query in variants:
        with tempfile.TemporaryDirectory(prefix='regression-audit-') as profile:
            cmd=[args.chrome,'--headless','--no-sandbox','--disable-gpu','--disable-software-rasterizer','--in-process-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--no-first-run','--user-data-dir='+profile,f'--window-size={width},1000','--dump-dom','--virtual-time-budget=60000']
            if dark:cmd.append('--force-dark-mode')
            run=subprocess.run(cmd+[url+query],capture_output=True,text=True,encoding='utf-8',timeout=90)
            match=re.search(r'<pre id="audit-result">(.*?)</pre>',run.stdout,re.S)
            if not match:raise RuntimeError(f'{name}: browser did not produce a report: {run.stdout[-500:]} {run.stderr[-500:]}')
            result=json.loads(html.unescape(match.group(1)));result['variant']=name;results.append(result)
            print(name, json.dumps(result), flush=True)
    assert all(hashlib.sha256(p.read_bytes()).hexdigest()==hashes[str(p)] for p in protected),'Protected model files changed'
    print('Protected model helpers and outputs: unchanged.',flush=True)
    raise SystemExit(1 if any(r['failures'] for r in results) else 0)
finally:
    fixture.unlink(missing_ok=True)
    server.shutdown();server.server_close()
