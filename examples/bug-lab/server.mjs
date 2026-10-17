import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const style = `*{box-sizing:border-box}body{margin:0;color:#172c3d;background:#f3f6f8;font:16px/1.6 'Trebuchet MS',sans-serif}header{padding:22px 6%;background:white;border-bottom:1px solid #dce3e8;display:flex;align-items:center;justify-content:space-between}nav{display:flex;gap:20px}a{color:#006b70}main{padding:42px 6%;max-width:1200px}h1{font-size:48px;line-height:1.1;letter-spacing:-2px;margin:10px 0 22px}h2{font-size:23px}p{max-width:60ch;color:#5c6d7b}.tag{background:#dfedeb;color:#006b70;border-radius:5px;padding:5px 9px;font-size:12px}.shelf{display:flex;gap:22px;flex-wrap:wrap;margin-top:32px}article{background:white;padding:23px;border:1px solid #dce3e8;border-radius:12px;width:290px}article img{width:240px;height:130px;background:#e5edef;border:1px dashed #83949f}#too-wide{width:760px;padding:22px;margin-top:30px;background:#e1f0ef;border-left:4px solid #006b70;border-radius:0 8px 8px 0}code{font:13px Consolas,monospace}footer{margin-top:35px;font-size:13px;color:#5c6d7b}@media(max-width:600px){h1{font-size:38px}header{padding:16px}main{padding:30px 18px}article{max-width:100%}nav{gap:10px;font-size:12px}}`;
const shell = (title, body, script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${title} · Bug Lab</title><style>${style}</style></head><body><header><b>VibeRepro / Bug Lab</b><nav><a href="/">The experiment</a><a href="/healthy">Healthy page</a></nav></header><main>${body}</main>${script}</body></html>`;

/** Deliberately broken fixture. All deterministic bugs are on our own loopback server. */
export function createBugLab() {
  let fixed = false;
  const hits = [];
  const server = createServer((req, res) => {
    hits.push({ method: req.method, url: req.url });
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/network-drop') {
      if (fixed) { res.writeHead(204); res.end(); } else req.socket.destroy();
      return;
    }
    if (fixed && pathname === '/missing-cover.png') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="130" viewBox="0 0 240 130"><rect width="240" height="130" fill="#006b70"/><circle cx="120" cy="58" r="32" fill="#dfedeb"/><path d="m107 57 9 10 19-22" fill="none" stroke="#006b70" stroke-width="5"/><text x="120" y="111" text-anchor="middle" fill="white" font-family="sans-serif" font-size="13">Evidence. Then a repair.</text></svg>');
      return;
    }
    if (pathname === '/redirect-out') { res.writeHead(302, { location: 'http://localhost:1/outside' }); res.end(); return; }
    if (pathname === '/redirect-in') { res.writeHead(302, { location: '/healthy' }); res.end(); return; }
    if (pathname === '/slow') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<!doctype html><html><body><h1>Slow stream</h1>');
      const timer = setTimeout(() => res.end('</body></html>'), 3000);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (pathname === '/history-change') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(shell('History fixture', '<h1>Changing route</h1>', `<script>setTimeout(()=>{throw new Error('Before history change')},30);setTimeout(()=>history.replaceState({},'', '/new-path'),60);setTimeout(()=>{throw new Error('After history change')},90);</script>`));
      return;
    }
    if (pathname === '/healthy') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(shell('Healthy page', `<span class="tag">Control sample</span><h1>Looks good at every size.</h1><p>This page has no known runtime, network, image, or overflow failures.</p><div style="overflow-x:auto;width:100%"><div style="width:1200px">This intentional scroll container should not trigger document overflow.</div></div><footer><a href="/">Back to the lab</a></footer>`));
      return;
    }
    if (pathname === '/safety') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(shell('Safety fixture', `<h1>Scan boundaries</h1><a href="/delete">Delete</a><a href="/logout">Logout</a><a href="/healthy?mutate=1">Query</a><a href="http://localhost:1/outside">Outside</a><a href="/healthy#fragment">Healthy</a><a href="/healthy">Duplicate</a><a href="/redirect-out">Redirect</a><img id="blocked-image" src="http://localhost:1/blocked.png" alt="Policy blocked"><form method="POST" action="/mutate"><button>Never clicked</button></form>`, `<script>fetch('/mutate',{method:'POST',body:'should-not-arrive'}).catch(()=>{});new WebSocket('ws://'+location.host+'/ws');</script>`));
      return;
    }
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const markup = `<span class="tag">${fixed ? 'Same page. Repairs applied.' : 'Intentionally broken. Totally reproducible.'}</span><h1>Good vibes.<br>${fixed ? 'Verified shipping.' : 'Questionable shipping.'}</h1><p>A tiny storefront with a missing hero image, a failed API request, an uncaught exception, and a layout that goes on a little too long. Give your coding agent something concrete to fix.</p><div class="shelf"><article><h2>The invisible print</h2><img id="broken-cover" src="/missing-cover.png" alt="An artwork that never arrived"><p>${fixed ? 'The image is available and decodes correctly.' : 'HTTP 404 + a broken image.'}</p></article><article><h2>The silent API</h2><p id="api-status">Trying to fetch the collection…</p><code>GET /api/collection → ${fixed ? '200' : '503'}</code></article></div><div id="too-wide"${fixed ? ' style="max-width:100%"' : ''}><b>A desktop-sized idea in a phone-sized world.</b><br>${fixed ? 'The panel now fits the viewport without hiding content.' : 'This 760px panel does not resize. On mobile, it pushes the whole document sideways.'}</div><footer>Known failures are seeded in this fixture. <a href="/healthy">Compare the healthy page</a>.</footer>`;
      const script = `<script>fetch('/api/collection').then(r=>{document.querySelector('#api-status').textContent=r.ok?'Collection loaded':'Collection unavailable: HTTP '+r.status});fetch('/network-drop').catch(()=>{});${fixed ? '' : "setTimeout(()=>{throw new Error('Bug Lab: collection renderer crashed')},80);"}</script>`;
      res.end(shell('The experiment', markup, script));
      return;
    }
    if (pathname === '/api/collection') { res.writeHead(fixed ? 200 : 503, { 'Content-Type': 'application/json' }); res.end(fixed ? '{"items":[]}' : '{"error":"Fixture unavailable"}'); return; }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Fixture: resource deliberately missing');
  });
  return { server, hits, repair: () => { fixed = true; } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createBugLab();
  server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1', () => console.log(`Bug Lab: http://127.0.0.1:${server.address().port}\nStop with Ctrl+C.`));
}
