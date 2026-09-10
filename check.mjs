// Probes each service, appends the result to data/history.json (rolling 30 days) and renders
// site/index.html. No external dependencies; runs on the schedule in .github/workflows/status.yml.
import fs from 'node:fs';

const SERVICES = [
  { id: 'app', name: 'Web application', url: 'https://app.iudexnc.ai/', expect: [200, 301, 302, 401, 403] },
  { id: 'api', name: 'API', url: 'https://api.iudexnc.ai/health', expect: [200] },
  { id: 'www', name: 'Website', url: 'https://iudexnc.ai/', expect: [200] },
];
const KEEP_MS = 30 * 24 * 3600 * 1000;
const now = new Date();

async function probe(s) {
  const t0 = Date.now();
  try {
    const r = await fetch(s.url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'iudexnc-status/1.0' } });
    return { up: s.expect.includes(r.status), code: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { up: false, code: 0, ms: Date.now() - t0, error: String(e).slice(0, 80) };
  }
}

fs.mkdirSync('data', { recursive: true });
fs.mkdirSync('site', { recursive: true });
let history = [];
try { history = JSON.parse(fs.readFileSync('data/history.json', 'utf8')); } catch {}

const results = {};
for (const s of SERVICES) results[s.id] = await probe(s);
history.push({ t: now.toISOString(), r: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, [v.up ? 1 : 0, v.code, v.ms]])) });
history = history.filter((h) => now - new Date(h.t) < KEEP_MS);
fs.writeFileSync('data/history.json', JSON.stringify(history));

function uptime(id, days) {
  const since = now - days * 24 * 3600 * 1000;
  const pts = history.filter((h) => new Date(h.t) >= since && h.r[id]);
  if (!pts.length) return null;
  return (100 * pts.filter((h) => h.r[id][0] === 1).length) / pts.length;
}
function incidents() {
  // contiguous runs of failed checks per service, newest first, last 30 days
  const out = [];
  for (const s of SERVICES) {
    let start = null; let last = null;
    for (const h of history) {
      const up = h.r[s.id]?.[0] === 1;
      if (!up && start === null) start = h.t;
      if (up && start !== null) { out.push({ name: s.name, start, end: last }); start = null; }
      last = h.t;
    }
    if (start !== null) out.push({ name: s.name, start, end: null });
  }
  return out.sort((a, b) => b.start.localeCompare(a.start)).slice(0, 20);
}
const fmt = (iso) => iso ? iso.replace('T', ' ').slice(0, 16) + ' UTC' : 'ongoing';
const allUp = SERVICES.every((s) => results[s.id].up);
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const rows = SERVICES.map((s) => {
  const r = results[s.id]; const u30 = uptime(s.id, 30); const u7 = uptime(s.id, 7);
  return `<tr><td>${esc(s.name)}<div class="muted">${esc(s.url)}</div></td>
<td><span class="dot ${r.up ? 'ok' : 'down'}"></span>${r.up ? 'Operational' : 'Unavailable'}</td>
<td>${r.ms} ms</td><td>${u7 === null ? 'n/a' : u7.toFixed(2) + ' %'}</td><td>${u30 === null ? 'n/a' : u30.toFixed(2) + ' %'}</td></tr>`;
}).join('\n');
const inc = incidents();
const incHtml = inc.length ? `<ul>${inc.map((i) => `<li><b>${esc(i.name)}</b>: ${fmt(i.start)} to ${fmt(i.end)}</li>`).join('')}</ul>` : '<p class="muted">No incidents recorded in the last 30 days.</p>';

fs.writeFileSync('site/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>iudexnc status</title><meta http-equiv="refresh" content="300">
<style>
body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:860px;margin:40px auto;padding:0 20px;color:#1f1f1f;background:#fafafa}
h1{font-size:22px;margin:0 0 4px}.banner{padding:14px 18px;border-radius:8px;margin:18px 0;font-weight:600;color:#fff;background:${allUp ? '#2e7d32' : '#c62828'}}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e3e3;border-radius:8px;overflow:hidden}
th,td{padding:12px 14px;text-align:left;border-bottom:1px solid #eee;font-size:14px}th{background:#f3f3f3;font-weight:600}
.muted{color:#777;font-size:12px}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px}.ok{background:#2e7d32}.down{background:#c62828}
footer{margin-top:28px;color:#777;font-size:12px}
</style></head><body>
<h1>iudexnc status</h1><div class="muted">Automated availability checks every 10 minutes for the Iudex Non Calculat coverage-check platform.</div>
<div class="banner">${allUp ? 'All systems operational' : 'Some systems are unavailable'}</div>
<table><thead><tr><th>Service</th><th>Status</th><th>Response</th><th>7-day uptime</th><th>30-day uptime</th></tr></thead><tbody>${rows}</tbody></table>
<h2 style="font-size:16px;margin-top:28px">Incidents (last 30 days)</h2>${incHtml}
<footer>Last check: ${fmt(now.toISOString())}. Checks: ${history.length} in the rolling 30-day window. Source: <a href="https://github.com/IudexNC/status">github.com/IudexNC/status</a>. Questions: security@iudexnc.ai</footer>
</body></html>`);
console.log(JSON.stringify({ t: now.toISOString(), results }, null, 1));
