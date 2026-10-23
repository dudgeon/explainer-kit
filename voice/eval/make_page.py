#!/usr/bin/env python3
"""Build eval/index.html (private, local, no network) from eval/scores.json + eval/lines.json."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
S = json.loads((ROOT / (sys.argv[1] if len(sys.argv) > 1 else "eval/scores.json")).read_text())   # make_page.py [scores file]
lines = json.loads((ROOT / "eval/lines.json").read_text())
systems = list(S["systems"])
data = {"ref": S["reference"], "real": {k: v for k, v in S["real"].items() if k != "clips"}, "systems": {}, "lines": []}
for s, v in S["systems"].items():
    data["systems"][s] = {k: v[k] for k in ("sim_heldout", "sim_video", "sim_same_line", "wer", "wps", "n")}
bylid = {s: {r["id"]: r for r in S["systems"][s]["lines"]} for s in systems}
for ln in lines:
    grp = ln["id"].split("-")[0]
    real = None
    if ln["set"] == "heldout":
        rel = f"takes/seg/{grp}/{grp}_{int(ln['id'].split('-')[1]):02d}.wav"
        if (ROOT / rel).exists(): real = "../" + rel
    row = {"id": ln["id"], "text": ln["text"], "set": ln["set"], "real": real, "sys": {}}
    for s in systems:
        r = bylid[s].get(ln["id"])
        if r and (ROOT / "eval/out" / s / f"{ln['id']}.wav").exists():
            row["sys"][s] = {"src": f"out/{s}/{ln['id']}.wav", "sim": r["sim"], "wer": r["wer"], "same": r.get("sim_same_line"), "asr": r["asr"]}
    data["lines"].append(row)

HTML = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voice clone eval</title><style>
:root{--bg:#fff;--fg:#1c1c1e;--mut:#6b6b70;--line:#e3e3e6;--card:#f6f6f8;--hi:#d9f2df;--hif:#0d5b25;--acc:#2a5bd7}
@media(prefers-color-scheme:dark){:root{--bg:#161618;--fg:#ececef;--mut:#9a9aa2;--line:#2c2c30;--card:#202024;--hi:#1b3d26;--hif:#8ee0a4;--acc:#8aa8ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
.mut{color:var(--mut)}.note{background:var(--card);border-radius:8px;padding:8px 12px;margin:10px 0;font-size:13px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:6px 10px;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left}td.best{background:var(--hi);color:var(--hif);font-weight:600}
dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;font-size:13px;margin:12px 0}dt{font-weight:600}dd{margin:0;color:var(--mut)}
.bar{display:flex;gap:10px;align-items:center;margin:16px 0;flex-wrap:wrap}button{font:inherit;padding:5px 12px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;cursor:pointer}
.line{border-top:1px solid var(--line);padding:14px 0}.line .t{font-weight:600;margin-bottom:8px}.line .id{color:var(--mut);font-weight:400;font-size:12px;margin-right:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}.p{background:var(--card);border-radius:8px;padding:8px 10px}
.p b{display:block;font-size:13px}.p small{color:var(--mut);display:block;font-size:12px;margin-top:2px}audio{width:100%;height:34px;margin-top:4px}
</style></head><body><main>
<h1>Voice clone eval</h1><div class="mut">Private, local. No network.</div>
<div id="note"></div><div id="tbl"></div>
<dl><dt>SIM</dt><dd>Speaker similarity to your real voice (cosine of ECAPA embeddings, -1..1; higher is better; the "real" row is the ceiling).</dd>
<dt>WER</dt><dd>Word error rate of the clip's transcript (Parakeet) against the intended text; lower is better.</dd>
<dt>wps</dt><dd>Words per second; compare with the real row for natural pace.</dd></dl>
<div class="bar"><label><input type="checkbox" id="blind"> Blind (hide names, shuffle)</label><button id="reveal" hidden>Reveal</button></div>
<div id="lines"></div></main>
<script>const D=__DATA__;
const f=(v,d=3)=>v==null?'-':v.toFixed(d);
const blind=document.getElementById('blind'),rev=document.getElementById('reveal');let revealed=false;
document.getElementById('note').innerHTML=D.ref.source==='heldout'?'':`<div class="note">Your held-out recordings (H1/H2) are not available yet: the real reference is ${D.ref.n} training clips (T01-T03), and the real row is each of them scored against the others.</div>`;
(function(){const cols=[['sim_heldout','SIM held-out',1],['sim_video','SIM video',1],['wer','WER',-1],['wps','wps',0]];
const best={};for(const [k,,dir] of cols){if(!dir)continue;const v=Object.entries(D.systems).filter(e=>e[1][k]!=null);
if(v.length)best[k]=v.reduce((a,b)=>(dir>0?b[1][k]>a[1][k]:b[1][k]<a[1][k])?b:a)[0]}
let h='<table><tr><th>system</th>'+cols.map(c=>`<th>${c[1]}</th>`).join('')+'<th>lines</th></tr>';
h+=`<tr><td><i>real (ceiling)</i></td><td>${f(D.real.sim_heldout)}</td><td>-</td><td>${f(D.real.wer)}</td><td>${f(D.real.wps,2)}</td><td></td></tr>`;
for(const [s,v] of Object.entries(D.systems))h+=`<tr><td>${s}</td>`+cols.map(([k,,d])=>`<td class="${best[k]===s?'best':''}">${f(v[k],k==='wps'?2:3)}</td>`).join('')+`<td>${v.n}</td></tr>`;
document.getElementById('tbl').innerHTML=h+'</table>'})();
function render(){const names=Object.keys(D.systems);const label={};
const order=names.map((n,i)=>i);
document.getElementById('lines').innerHTML=D.lines.map(L=>{let ids=names.filter(n=>L.sys[n]);
if(blind.checked){if(!L._o)L._o=[...ids].sort(()=>Math.random()-.5);ids=L._o}
let h=`<div class="line"><div class="t"><span class="id">${L.id}</span>${L.text}</div><div class="grid">`;
if(L.real)h+=`<div class="p"><b>You (real)</b><audio controls preload="none" src="${L.real}"></audio></div>`;
ids.forEach((n,i)=>{const r=L.sys[n];const nm=blind.checked&&!revealed?'Clip '+String.fromCharCode(65+i):n;
h+=`<div class="p"><b>${nm}</b><audio controls preload="none" src="${r.src}"></audio><small>SIM ${f(r.sim)}${r.same!=null?' / same-line '+f(r.same):''} · WER ${f(r.wer)}</small>${blind.checked&&!revealed?'':`<small title="ASR">${r.asr}</small>`}</div>`});
return h+'</div></div>'}).join('')}
blind.onchange=()=>{revealed=false;D.lines.forEach(L=>delete L._o);rev.hidden=!blind.checked;render()};rev.onclick=()=>{revealed=true;render()};render();
</script></body></html>"""
(ROOT / "eval/index.html").write_text(HTML.replace("__DATA__", json.dumps(data).replace("</", "<\\/")))
print("wrote eval/index.html")
