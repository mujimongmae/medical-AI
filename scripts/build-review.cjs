// 응급처치 프로토콜 검토용 HTML 생성기 — 컴파일된 실제 데이터에서 생성 (수기 전사 아님)
// 사용: tsc로 lib/first-aid/*.ts → .tmp-fa/ 컴파일 후 `node scripts/build-review.cjs`
const fs = require("fs");
const path = require("path");

const { PROTOCOLS } = require("../.tmp-fa/protocols.js");
const { TRIAGE, TRIAGE_ROOT } = require("../.tmp-fa/triage.js");
const { GLOBAL_DISCLAIMER } = require("../.tmp-fa/schema.js");

const DATA = JSON.stringify({ PROTOCOLS, TRIAGE, TRIAGE_ROOT, GLOBAL_DISCLAIMER });

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>응급처치 프로토콜 검토 — 마음날씨/응급 가디언</title>
<style>
  :root {
    --critical:#dc2626; --urgent:#ea580c; --caution:#ca8a04;
    --bg:#f5f5f4; --card:#fff; --ink:#1c1917; --sub:#78716c; --line:#e7e5e4; --sky:#0284c7;
  }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,"Malgun Gothic",sans-serif; background:var(--bg); color:var(--ink); line-height:1.65; }
  .wrap { max-width:860px; margin:0 auto; padding:0 16px 80px; }
  header.top { position:sticky; top:0; z-index:5; background:#fff; border-bottom:1px solid var(--line); }
  header.top .h { padding:14px 16px; max-width:860px; margin:0 auto; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  header.top h1 { font-size:18px; margin:0; }
  .disc { background:#fef2f2; color:#7f1d1d; font-size:13px; padding:8px 16px; text-align:center; }
  h2.sec { margin:28px 0 12px; font-size:20px; border-left:5px solid var(--sky); padding-left:10px; }
  /* triage */
  .triage { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:18px; }
  .triage .prompt { font-size:18px; font-weight:700; }
  .triage .hint { color:var(--sub); font-size:14px; margin-top:6px; }
  .opts { display:flex; flex-direction:column; gap:8px; margin-top:14px; }
  .opts button { text-align:left; font-size:16px; padding:13px 16px; border-radius:12px; border:1px solid #bae6fd; background:#f0f9ff; color:#075985; cursor:pointer; }
  .opts button:hover { background:#e0f2fe; }
  .crumbs { font-size:13px; color:var(--sub); margin-top:12px; word-break:keep-all; }
  .crumbs button { background:none; border:none; color:var(--sky); cursor:pointer; padding:0; font-size:13px; text-decoration:underline; }
  .result { margin-top:12px; padding:12px 14px; border-radius:12px; background:#ecfeff; border:1px solid #a5f3fc; }
  .result a { color:var(--sky); font-weight:700; }
  /* index chips */
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
  .chips a { text-decoration:none; font-size:14px; padding:6px 12px; border-radius:999px; border:1px solid var(--line); background:#fff; color:var(--ink); }
  /* protocol cards */
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; margin:16px 0; scroll-margin-top:80px; }
  .card h3 { margin:0; font-size:20px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .badge { font-size:12px; font-weight:700; color:#fff; padding:3px 9px; border-radius:999px; }
  .b-critical{background:var(--critical);} .b-urgent{background:var(--urgent);} .b-caution{background:var(--caution);}
  .meta { color:var(--sub); font-size:14px; margin:8px 0 0; }
  .meta b { color:var(--ink); }
  .tag { display:inline-block; font-size:12px; background:#f5f5f4; border:1px solid var(--line); border-radius:6px; padding:1px 7px; margin-right:4px; }
  ol.steps { padding-left:0; list-style:none; counter-reset:s; margin:14px 0 0; }
  ol.steps > li { counter-increment:s; position:relative; padding:12px 0 12px 42px; border-top:1px dashed var(--line); }
  ol.steps > li::before { content:counter(s); position:absolute; left:0; top:12px; width:28px; height:28px; background:var(--sky); color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; }
  .st-title { font-weight:700; font-size:16px; }
  .st-detail { margin-top:3px; }
  .st-extra { font-size:13px; margin-top:6px; }
  .st-caution { color:#9a3412; background:#fff7ed; border-left:3px solid var(--urgent); padding:6px 10px; border-radius:0 8px 8px 0; margin-top:6px; font-size:14px; }
  .st-repeat { color:#075985; background:#f0f9ff; border-radius:8px; padding:6px 10px; margin-top:6px; font-size:14px; }
  .st-bypat { margin-top:6px; font-size:14px; }
  .st-bypat span { display:block; }
  .donot { margin-top:14px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:10px 14px; }
  .donot b { color:#991b1b; }
  .donot ul { margin:6px 0 0; padding-left:18px; }
  .handoff { margin-top:10px; font-size:14px; color:var(--sub); }
  .src { margin-top:10px; font-size:12px; color:var(--sub); }
  .flag { color:var(--critical); font-weight:700; }
</style>
</head>
<body>
<header class="top">
  <div class="h"><span style="font-size:22px">🚑</span><h1>응급처치 프로토콜 검토본</h1><span style="font-size:12px;color:#78716c">KACPR 2020 기반 · 일반인용</span></div>
  <div class="disc" id="disc"></div>
</header>
<div class="wrap">
  <h2 class="sec">1. 트리아지 (직접 눌러 확인)</h2>
  <div class="triage">
    <div class="prompt" id="tPrompt"></div>
    <div class="hint" id="tHint"></div>
    <div class="opts" id="tOpts"></div>
    <div class="result" id="tResult" style="display:none"></div>
    <div class="crumbs" id="tCrumbs"></div>
  </div>

  <h2 class="sec">2. 프로토콜 (${PROTOCOLS.length}개)</h2>
  <div class="chips" id="chips"></div>
  <div id="cards"></div>
</div>

<script>
const D = ${DATA};
const URG = { critical:"긴급(생명위협)", urgent:"응급", caution:"주의" };
const PT = { adult:"성인", child:"소아", infant:"영아" };
document.getElementById("disc").textContent = D.GLOBAL_DISCLAIMER;
const byId = Object.fromEntries(D.PROTOCOLS.map(p=>[p.id,p]));

// ---------- Triage walker ----------
let path=[];
function esc(s){return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
function renderNode(id){
  const n = D.TRIAGE[id];
  document.getElementById("tResult").style.display="none";
  document.getElementById("tPrompt").textContent = n.prompt;
  document.getElementById("tHint").textContent = n.hint||"";
  const opts = document.getElementById("tOpts"); opts.innerHTML="";
  (n.options||[]).forEach(o=>{
    const b=document.createElement("button");
    b.textContent=o.label;
    b.onclick=()=>{ path.push({id,label:o.label}); if(o.protocolId) reachProtocol(o.protocolId); else renderNode(o.next); crumbs(); };
    opts.appendChild(b);
  });
  crumbs();
}
function reachProtocol(pid){
  const p=byId[pid];
  const r=document.getElementById("tResult");
  document.getElementById("tOpts").innerHTML="";
  document.getElementById("tPrompt").textContent="➡️ 이 상황에 적용할 프로토콜";
  document.getElementById("tHint").textContent="";
  r.style.display="block";
  r.innerHTML = '<a href="#'+pid+'">'+esc(p.name)+' ('+pid+')</a> — '+esc(p.appliesTo);
  document.querySelector("#"+CSS.escape(pid)).scrollIntoView({behavior:"smooth"});
}
function crumbs(){
  const c=document.getElementById("tCrumbs");
  c.innerHTML = '<button onclick="reset()">↺ 처음부터</button>' + path.map(s=>' › '+esc(s.label)).join("");
}
function reset(){ path=[]; renderNode(D.TRIAGE_ROOT); }
window.reset=reset;

// ---------- Protocol cards ----------
function stepHTML(s){
  let h='<li><div class="st-title">'+esc(s.title)+'</div><div class="st-detail">'+esc(s.detail)+'</div>';
  if(s.durationSec) h+='<div class="st-extra">⏱ 권장 '+s.durationSec+'초</div>';
  if(s.byPatient){ h+='<div class="st-bypat">'; for(const k in s.byPatient) h+='<span><b>'+(PT[k]||k)+':</b> '+esc(s.byPatient[k])+'</span>'; h+='</div>'; }
  if(s.repeat){ let r='🔁 반복'; if(s.repeat.ratePerMin) r+=' · 분당 '+s.repeat.ratePerMin[0]+'~'+s.repeat.ratePerMin[1]+'회'; if(s.repeat.cycle) r+=' · '+s.repeat.cycle.compressions+':'+s.repeat.cycle.breaths; if(s.repeat.until) r+=' · '+esc(s.repeat.until); h+='<div class="st-repeat">'+r+'</div>'; }
  if(s.caution) h+='<div class="st-caution">⚠ '+esc(s.caution)+'</div>';
  h+='</li>';
  return h;
}
function cardHTML(p){
  let h='<div class="card" id="'+p.id+'">';
  h+='<h3><span class="badge b-'+p.urgency+'">'+URG[p.urgency]+'</span>'+esc(p.name)+'</h3>';
  h+='<div class="meta"><b>적용:</b> '+esc(p.appliesTo)+'</div>';
  h+='<div class="meta"><b>대상:</b> '+p.patientType.map(t=>'<span class="tag">'+(PT[t]||t)+'</span>').join("")+
     ' &nbsp; <b>119 자동신고:</b> '+(p.callEmergencyFirst?'<span class="flag">해당(긴급)</span>':'—')+'</div>';
  if(p.aka) h+='<div class="meta"><b>다른 이름:</b> '+p.aka.map(esc).join(", ")+'</div>';
  h+='<ol class="steps">'+p.steps.map(stepHTML).join("")+'</ol>';
  h+='<div class="donot"><b>❌ 하면 안 되는 것</b><ul>'+p.doNot.map(d=>'<li>'+esc(d)+'</li>').join("")+'</ul></div>';
  h+='<div class="handoff"><b>🚑 구급대 인계:</b> '+esc(p.handoff)+'</div>';
  h+='<div class="src">근거: '+p.source.map(s=>esc(s.org+" 「"+s.title+"」("+s.year+")")).join(" · ")+'</div>';
  h+='</div>';
  return h;
}
document.getElementById("chips").innerHTML = D.PROTOCOLS.map(p=>'<a href="#'+p.id+'">'+esc(p.name)+'</a>').join("");
document.getElementById("cards").innerHTML = D.PROTOCOLS.map(cardHTML).join("");
reset();
</script>
</body>
</html>`;

const out = path.join(__dirname, "..", "docs", "first-aid-review.html");
fs.writeFileSync(out, html, "utf8");
console.log("WROTE " + out + " (" + html.length + " bytes)");
