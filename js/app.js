// ---------- Inhalt laden (aus data/*.json — hier können Vokabeln/Sätze ergänzt werden) ----------
let VOCAB = [], PP = [], SENT = [];

async function loadContent(){
  const [vocab, pp, sent] = await Promise.all([
    fetch("data/vocab.json").then(r=>r.json()),
    fetch("data/passato.json").then(r=>r.json()),
    fetch("data/sentences.json").then(r=>r.json())
  ]);
  VOCAB = vocab; PP = pp; SENT = sent;
}

// ---------- Anzeige- & Antwort-Helfer (m/w-fähig) ----------
function itText(o){ return o.itF ? o.it+" / "+o.itF : o.it; }
function deText(o){ return o.deF ? o.de+" / "+o.deF : o.de; }
function itAnswers(o){ return o.itF ? [o.it,o.itF] : [o.it]; }
function deAnswers(o){ return o.deF ? [o.de,o.deF] : [o.de]; }
function hasGender(o){ return !!(o.itF || o.deF); }

// stabile ID pro Vokabel, robust gegenüber Akzenten/Apostrophen — übersteht Ergänzungen in vocab.json
function slug(it){
  return it.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]","g"),"").replace(/[^a-zA-Z]/g,"").toLowerCase();
}

// ---------- Profil & Fortschritt (localStorage, pro Profil getrennt) ----------
const PROFILE_KEY = "italiano_profile";
function stateKey(profile){ return "italiano_state_"+profile; }

function loadProfile(){ return localStorage.getItem(PROFILE_KEY) || "Francis"; }
function saveProfile(name){ localStorage.setItem(PROFILE_KEY, name); }

function loadSavedState(profile){
  try{ return JSON.parse(localStorage.getItem(stateKey(profile))) || {}; }
  catch{ return {}; }
}
function persistState(){
  const saved = {};
  state.forEach(s=>{ saved[s.id] = {box:s.box, due:s.due}; });
  localStorage.setItem(stateKey(profile), JSON.stringify(saved));
}

let profile = loadProfile();

// ---------- Zustand ----------
const NBOX=5, MAX_TRIES=3;
let state = [];
let mode="card", dir="it2de";

function buildState(){
  const saved = loadSavedState(profile);
  state = VOCAB.map(v=>{
    const id = slug(v.it);
    const prev = saved[id];
    return {...v, id, box: prev ? prev.box : 1, due: prev ? prev.due : true};
  });
}

// streng: nur exakte Übereinstimmung (Groß/Klein egal, Akzente & Artikel zählen)
function isCorrect(input, answers){
  const i=input.trim().toLowerCase();
  return answers.some(a=>i===a.trim().toLowerCase());
}

// ---------- Leitner / fällig ----------
function pickDue(){
  const due=state.filter(s=>s.due); if(!due.length) return null;
  const w=due.map(s=>Math.pow(2,NBOX-s.box));
  let r=Math.random()*w.reduce((a,b)=>a+b,0);
  for(let i=0;i<due.length;i++){if((r-=w[i])<=0)return due[i];}
  return due[0];
}
function promote(item){item.box=Math.min(NBOX,item.box+1);item.due=false;persistState();}
function demote(item){item.box=1;item.due=true;persistState();}

function renderProgress(){
  const labels=["1 · neu","2","3","4","5 · sicher"];
  const counts=Array(NBOX).fill(0); state.forEach(s=>counts[s.box-1]++);
  document.getElementById("leitner").innerHTML=counts.map((c,i)=>`
    <div class="box ${i===NBOX-1?'done':''}">
      <div class="fill" style="height:${c/state.length*100}%"></div>
      <div class="n">${c}</div><div class="lab">${labels[i]}</div></div>`).join("");
  const due=state.filter(s=>s.due).length, sicher=counts[NBOX-1];
  document.getElementById("meta").innerHTML=
    `<span class="due">${due} heute fällig</span> · <b>${sicher}</b> von ${state.length} gefestigt`;
}

// ---------- gemeinsame Helfer ----------
const stage=document.getElementById("stage");
const dirbar=document.getElementById("dirbar");
let cur=null;
function tryDots(used){return Array.from({length:MAX_TRIES},(_,i)=>
  `<span class="dot ${i<used?'used':''}"></span>`).join("");}
function showNext(){
  const chk=document.getElementById("chk");
  if(chk) chk.outerHTML=`<button class="btn ghost" id="nx">Weiter →</button>`;
  document.getElementById("nx").onclick=next;
}
function vocabDone(){
  stage.innerHTML=`<div style="text-align:center">
      <div class="prompt" style="font-size:26px">Bravissimo! 🎉</div>
      <p class="sub">Alle fälligen Vokabeln für heute geschafft.</p>
      <div class="row"><button class="btn ghost" id="again">Trotzdem weiterüben</button></div></div>`;
  document.getElementById("again").onclick=()=>{state.forEach(s=>s.due=true);persistState();renderProgress();next();};
}

// ---------- Karten ----------
function renderCard(){
  cur=pickDue(); if(!cur)return vocabDone();
  const front=dir==="it2de"?itText(cur):deText(cur);
  const back =dir==="it2de"?deText(cur):itText(cur);
  const note = hasGender(cur) ? `<div class="gender-note">m / w</div>` : "";
  stage.innerHTML=`
    <div class="prompt-lab">${dir==="it2de"?"Italienisch → Deutsch":"Deutsch → Italienisch"}</div>
    <div class="prompt ${dir==="it2de"?"it":""}">${front}</div>
    ${dir==="it2de"?note:""}
    <div id="back" style="display:none">
      <div class="prompt ${dir==="it2de"?"":"it"}">${back}</div>
      ${dir==="it2de"?"":note}
      <div class="example">„${cur.ex}"</div></div>
    <div class="row" id="cardrow"><button class="btn primary" id="flip">Umdrehen</button></div>`;
  document.getElementById("flip").onclick=()=>{
    document.getElementById("back").style.display="block";
    document.getElementById("cardrow").innerHTML=
      `<button class="btn bad" id="no">Nochmal</button><button class="btn good" id="yes">Gewusst</button>`;
    document.getElementById("yes").onclick=()=>{promote(cur);renderProgress();next();};
    document.getElementById("no").onclick=()=>{demote(cur);renderProgress();next();};
  };
}

// ---------- Auswahl ----------
function renderMC(){
  cur=pickDue(); if(!cur)return vocabDone();
  const prompt=dir==="it2de"?itText(cur):deText(cur);
  const wrongs=state.filter(s=>s.id!==cur.id).sort(()=>Math.random()-.5).slice(0,3);
  const opts=[cur,...wrongs].sort(()=>Math.random()-.5);
  stage.innerHTML=`<div class="prompt-lab">Was heißt …?</div>
    <div class="prompt ${dir==="it2de"?"it":""}">${prompt}</div>
    <div class="choices" id="ch"></div><div class="feedback" id="fb"></div>`;
  const ch=document.getElementById("ch");let correctBtn=null;
  opts.forEach(o=>{
    const label=dir==="it2de"?deText(o):itText(o);
    const b=document.createElement("button");b.className="choice";
    b.innerHTML=dir==="it2de"?label:`<span class="it">${label}</span>`;
    if(o.id===cur.id)correctBtn=b;
    b.onclick=()=>{
      [...ch.children].forEach(c=>c.disabled=true);
      const fb=document.getElementById("fb");
      if(o.id===cur.id){b.classList.add("right");promote(cur);fb.className="feedback ok";fb.textContent="Bravo!";}
      else{b.classList.add("wrong");demote(cur);correctBtn.classList.add("right");
        fb.className="feedback no";fb.textContent="Richtig: "+(dir==="it2de"?deText(cur):itText(cur));}
      renderProgress();
      setTimeout(()=>{stage.insertAdjacentHTML("beforeend",
        `<div class="row"><button class="btn ghost" id="nx">Weiter →</button></div>`);
        document.getElementById("nx").onclick=next;},220);
    };
    ch.appendChild(b);
  });
}

// ---------- Tippen (3 Versuche; beide Geschlechtsformen gelten) ----------
function renderType(){
  cur=pickDue(); if(!cur)return vocabDone();
  const prompt=dir==="it2de"?itText(cur):deText(cur);
  const answers=dir==="it2de"?deAnswers(cur):itAnswers(cur);
  let used=0;
  stage.innerHTML=`
    <div class="prompt-lab">Übersetze & tippe</div>
    <div class="prompt ${dir==="it2de"?"it":""}">${prompt}</div>
    <input class="fill-in" id="ans" placeholder="deine Übersetzung…" autocomplete="off" autocapitalize="off">
    <div class="tries" id="tries">${tryDots(0)}</div>
    <div class="feedback" id="fb"></div>
    <div class="row"><button class="btn primary" id="chk">Prüfen</button></div>`;
  const inp=document.getElementById("ans"),fb=document.getElementById("fb");inp.focus();
  function check(){
    if(inp.disabled)return;
    if(isCorrect(inp.value,answers)){
      fb.className="feedback ok";fb.textContent=used===0?"Esatto!":"Richtig — geschafft!";
      promote(cur);renderProgress();inp.disabled=true;showNext();return;
    }
    used++;document.getElementById("tries").innerHTML=tryDots(used);
    inp.classList.remove("shake");void inp.offsetWidth;inp.classList.add("shake");
    if(used>=MAX_TRIES){
      fb.className="feedback no";fb.innerHTML="Richtig: <b>"+answers.join(" / ")+"</b>";
      demote(cur);renderProgress();inp.disabled=true;showNext();
    }else{
      const left=MAX_TRIES-used;fb.className="feedback no";
      fb.textContent=`Nicht ganz — versuch's nochmal (noch ${left} ${left===1?"Versuch":"Versuche"}).`;
      inp.focus();inp.select();
    }
  }
  document.getElementById("chk").onclick=check;
  inp.onkeydown=e=>{if(e.key==="Enter")check();};
}

// ---------- Passato Prossimo ----------
function renderPP(){
  const q=PP[Math.floor(Math.random()*PP.length)];let used=0;
  stage.innerHTML=`
    <div class="prompt-lab">Passato Prossimo · Lücke füllen</div>
    <div class="pp-sentence">${q.pre} <span class="pp-blank">&nbsp;____&nbsp;</span> ${q.post}</div>
    <div class="pp-hint">${q.hint}</div>
    <input class="fill-in" id="ans" placeholder="deine Antwort…" autocomplete="off" autocapitalize="off">
    <div class="tries" id="tries">${tryDots(0)}</div>
    <div class="feedback" id="fb"></div>
    <div class="row"><button class="btn primary" id="chk">Prüfen</button></div>`;
  const inp=document.getElementById("ans"),fb=document.getElementById("fb");inp.focus();
  function check(){
    if(inp.disabled)return;
    if(isCorrect(inp.value,q.answers)){
      fb.className="feedback ok";fb.innerHTML=`Esatto! ${q.pre} <b>${q.answers[0]}</b> ${q.post}`;
      inp.disabled=true;showNext();return;
    }
    used++;document.getElementById("tries").innerHTML=tryDots(used);
    inp.classList.remove("shake");void inp.offsetWidth;inp.classList.add("shake");
    if(used>=MAX_TRIES){
      fb.className="feedback no";fb.innerHTML="Richtig: <b>"+q.answers.join(" / ")+"</b>";
      inp.disabled=true;showNext();
    }else{
      const left=MAX_TRIES-used;fb.className="feedback no";
      fb.textContent=`Nicht ganz — versuch's nochmal (noch ${left} ${left===1?"Versuch":"Versuche"}).`;
      inp.focus();inp.select();
    }
  }
  document.getElementById("chk").onclick=check;
  inp.onkeydown=e=>{if(e.key==="Enter")check();};
}

// ---------- Sätze bauen ----------
function renderBuild(){
  const q=SENT[Math.floor(Math.random()*SENT.length)];
  const shuffled=[...q.words].map((w,i)=>({w,i})).sort(()=>Math.random()-.5);
  let placed=[],used=0,locked=false;
  stage.innerHTML=`
    <div class="prompt-lab">Satz bauen</div>
    <div class="example" style="margin:6px 0 14px">„${q.de}"</div>
    <div class="build-target" id="tgt"></div>
    <div class="build-pool" id="pool"></div>
    <div class="tries" id="tries">${tryDots(0)}</div>
    <div class="feedback" id="fb"></div>
    <div class="row"><button class="btn primary" id="chk">Prüfen</button></div>`;
  const pool=document.getElementById("pool"),tgt=document.getElementById("tgt"),fb=document.getElementById("fb");
  function draw(){
    pool.innerHTML="";tgt.innerHTML="";
    shuffled.forEach(o=>{if(placed.includes(o))return;
      const b=document.createElement("button");b.className="word";b.textContent=o.w;b.disabled=locked;
      b.onclick=()=>{placed.push(o);draw();};pool.appendChild(b);});
    placed.forEach(o=>{
      const b=document.createElement("button");b.className="word placed";b.textContent=o.w;b.disabled=locked;
      b.onclick=()=>{placed=placed.filter(x=>x!==o);draw();};tgt.appendChild(b);});
  }
  draw();
  document.getElementById("chk").onclick=()=>{
    if(locked)return;
    const got=placed.map(o=>o.w).join(" "), want=q.words.join(" ");
    if(got===want){fb.className="feedback ok";fb.innerHTML=`Perfetto! <b>${want}.</b>`;locked=true;draw();showNext();return;}
    used++;document.getElementById("tries").innerHTML=tryDots(used);
    if(used>=MAX_TRIES){fb.className="feedback no";fb.innerHTML="Richtig: <b>"+want+".</b>";locked=true;draw();showNext();}
    else{const left=MAX_TRIES-used;fb.className="feedback no";
      fb.textContent=`Noch nicht richtig — sortier nochmal (noch ${left} ${left===1?"Versuch":"Versuche"}).`;}
  };
}

const renderers={card:renderCard,mc:renderMC,type:renderType,pp:renderPP,build:renderBuild};
function next(){renderProgress();dirbar.style.display=["card","mc","type"].includes(mode)?"flex":"none";renderers[mode]();}

document.querySelectorAll("nav button").forEach(b=>{
  b.onclick=()=>{document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");mode=b.dataset.mode;next();};
});
document.querySelectorAll(".dir button").forEach(b=>{
  b.onclick=()=>{document.querySelectorAll(".dir button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");dir=b.dataset.dir;next();};
});
document.getElementById("switch").onclick=()=>{
  const n=prompt("Profilname:", profile);
  if(!n || !n.trim())return;
  profile=n.trim();
  saveProfile(profile);
  document.getElementById("pname").textContent=profile;
  buildState();
  next();
};

(async function init(){
  await loadContent();
  document.getElementById("pname").textContent=profile;
  buildState();
  next();
})();
