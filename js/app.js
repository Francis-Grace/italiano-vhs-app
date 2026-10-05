"use strict";
/* Ripassa l'italiano — Übungs-App für den VHS-Kurs.
   Inhalte: data/*.json (Schema siehe README.md). Fortschritt: localStorage, pro Profil. */

// ======================================================================
// Konfiguration
// ======================================================================
const NBOX = 5, MAX_TRIES = 3;
// Tage bis zur nächsten Abfrage je Fach (Index = Fach-1). Fach 1 = sofort wieder.
const INTERVAL_DAYS = [0, 1, 3, 7, 21];
const BOX_LABELS = ["neu", "2", "3", "4", "sicher"];
const ALL = "__alle__";

// ======================================================================
// Kleine Helfer
// ======================================================================
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const list = x => x == null ? [] : Array.isArray(x) ? x : String(x).split(" / ");
const stripAccents = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// stabile ID — muss gleich bleiben, sonst geht der Fortschritt verloren (deshalb wie in Version 1)
function slug(s) { return stripAccents(s).replace(/[^a-zA-Z]/g, "").toLowerCase(); }

// Mitternacht + n Tage (lokale Zeit) → alle Wiederholungen eines Tages sind morgens fällig
function dayOffset(days) {
  if (!days) return 0;
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days); return d.getTime();
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* privates Fenster o. Ä. */ } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } }
};

// ======================================================================
// Inhalte
// ======================================================================
let VOCAB = [], PP = [], SENT = [], VERBS = [];

async function loadContent() {
  const get = f => fetch(f).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
  const [vocab, pp, sent, verbs] = await Promise.all([get("data/vocab.json"), get("data/passato.json"), get("data/sentences.json"), get("data/verbs.json")]);
  VOCAB = vocab.map(v => ({
    ...v,
    id: v.id || slug(v.it),
    itList: [v.it, ...(v.itF ? [v.itF] : [])],
    deList: [...list(v.de), ...list(v.deF)],
  }));
  PP = pp.map(p => ({ ...p, id: "pp:" + (p.id || slug(p.pre + " " + p.post)) }));
  SENT = sent.map(s => ({ ...s, id: "s:" + (s.id || slug(s.words.join(" "))) }));
  VERBS = verbs.map(v => ({ ...v, id: "vb:" + (v.id || slug(v.inf)) }));
}

const itText = o => o.itList.join(" / ");
const deText = o => o.deList.join(" / ");
const hasGender = o => !!(o.itF || o.deF);

// ======================================================================
// Profil, Einstellungen, Fortschritt
// ======================================================================
const PROFILE_KEY = "italiano_profile", SETTINGS_KEY = "italiano_settings", STATE_PREFIX = "italiano_state_";
let profile = store.get(PROFILE_KEY);
let progress = {};   // id → {box, due(ms; 0 = sofort)}
let settings = Object.assign({ mode: "card", dir: "it2de", vm: "table", kurs: ALL, lek: ALL }, safeJSON(store.get(SETTINGS_KEY)));

function safeJSON(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }
function saveSettings() { store.set(SETTINGS_KEY, JSON.stringify(settings)); }
function knownProfiles() { return store.keys().filter(k => k.startsWith(STATE_PREFIX)).map(k => k.slice(STATE_PREFIX.length)).sort(); }

function loadProgress() {
  const raw = safeJSON(store.get(STATE_PREFIX + profile));
  progress = {};
  for (const [id, r] of Object.entries(raw)) {
    if (!r || typeof r.box !== "number") continue;
    const box = Math.min(NBOX, Math.max(1, r.box));
    // Altes Format (Version 1): due war true/false
    let due = r.due;
    if (typeof due === "boolean") due = due ? 0 : dayOffset(INTERVAL_DAYS[box - 1]);
    progress[id] = { box, due: Number(due) || 0 };
  }
}
function saveProgress() { store.set(STATE_PREFIX + profile, JSON.stringify(progress)); }
const rec = id => progress[id] || { box: 1, due: 0 };
const isDue = id => rec(id).due <= Date.now();

/* Bewertung:
   good  = sofort gewusst  → ein Fach höher
   hard  = mit Fehlversuchen geschafft → Fach bleibt, morgen wieder
   again = nicht gewusst   → zurück in Fach 1, gleich nochmal
   In der Extra-Runde (Eintrag war nicht fällig) zählt nur „again“. */
function grade(item, result) {
  const r = { ...rec(item.id) };
  if (result !== "again" && !isDue(item.id)) return;
  if (result === "good") { r.box = Math.min(NBOX, r.box + 1); r.due = dayOffset(INTERVAL_DAYS[r.box - 1]); }
  else if (result === "hard") { r.due = dayOffset(1); }
  else { r.box = 1; r.due = 0; }
  progress[item.id] = r; saveProgress();
}

// ======================================================================
// Filter (Kurs / Lektion)
// ======================================================================
const lekLabel = l => typeof l === "number" || /^\d+$/.test(l) ? "Lektion " + l : String(l);

function matchesFilter(o) {
  if (settings.kurs !== ALL && o.kurs !== settings.kurs) return false;
  if (settings.lek !== ALL && String(o.lektion) !== settings.lek) return false;
  return true;
}
function pool(m = mode()) {
  const src = m === "pp" ? PP : m === "build" ? SENT : m === "vb" ? VERBS : VOCAB;
  return src.filter(matchesFilter);
}

function renderFilter() {
  const all = [...VOCAB, ...VERBS, ...PP, ...SENT];
  const kurse = [...new Set(all.map(o => o.kurs).filter(Boolean))].sort();
  if (settings.kurs !== ALL && !kurse.includes(settings.kurs)) settings.kurs = ALL;
  $("fKurs").innerHTML = `<option value="${ALL}">Alle Kurse</option>` +
    kurse.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join("");
  $("fKurs").value = settings.kurs;

  const inKurs = all.filter(o => settings.kurs === ALL || o.kurs === settings.kurs);
  const leks = [...new Set(inKurs.map(o => o.lektion).filter(l => l != null && l !== "").map(String))]
    .sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
  if (settings.lek !== ALL && !leks.includes(settings.lek)) settings.lek = ALL;
  $("fLek").innerHTML = `<option value="${ALL}">${leks.length ? "Alle Lektionen" : "–"}</option>` +
    leks.map(l => `<option value="${esc(l)}">${esc(lekLabel(l))}</option>`).join("");
  $("fLek").value = settings.lek;
  $("fLek").disabled = !leks.length;
}

// ======================================================================
// Auswahl des nächsten Eintrags
// ======================================================================
let lastId = null, extra = false;

function pickDue(items) {
  let due = items.filter(o => isDue(o.id));
  if (due.length > 1) due = due.filter(o => o.id !== lastId);   // nicht zweimal hintereinander
  if (!due.length) return null;
  return weighted(due, o => Math.pow(2, NBOX - rec(o.id).box));
}
function pickExtra(items) {
  let c = items.length > 1 ? items.filter(o => o.id !== lastId) : items;
  return c.length ? weighted(c, o => Math.pow(2, NBOX - rec(o.id).box)) : null;
}
function weighted(arr, wf) {
  const w = arr.map(wf); let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < arr.length; i++) if ((r -= w[i]) <= 0) return arr[i];
  return arr[arr.length - 1];
}

// ======================================================================
// Antwort prüfen (streng, aber mit hilfreichen Hinweisen)
// ======================================================================
function norm(s) {
  return String(s).normalize("NFC").replace(/[’‘`´]/g, "'").replace(/'\s+/g, "'")
    .replace(/\s+/g, " ").trim().toLowerCase().replace(/[.!?,;:]+$/, "");
}
// „besuchen (einen Kurs)“ → auch „besuchen“ und „besuchen einen Kurs“ gelten
function variants(a) {
  const n = norm(a), out = new Set([n]);
  if (/\(.*\)/.test(n)) { out.add(norm(n.replace(/\s*\([^)]*\)/g, ""))); out.add(norm(n.replace(/[()]/g, ""))); }
  return [...out];
}
const ART_IT = /^(?:(?:il|lo|la|i|gli|le|un|uno|una)\s+|(?:l|un)')/;
const ART_DE = /^(?:der|die|das|ein|eine)\s+/;
const stripArt = (s, re) => s.replace(re, "");

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/* → {ok:true} oder {ok:false, near:"Hinweis"} */
function checkAnswer(input, answers, lang) {
  const inp = norm(input);
  if (!inp) return { ok: false };
  const all = answers.flatMap(variants);
  if (all.includes(inp)) return { ok: true };
  const art = lang === "it" ? ART_IT : ART_DE;
  for (const a of all) {
    if (stripAccents(a) === stripAccents(inp))
      return { ok: false, near: lang === "it" ? "Fast! Achte auf den Akzent." : "Fast! Achte auf Umlaute." };
  }
  for (const a of all) {
    const ai = stripArt(a, art), ii = stripArt(inp, art);
    if (ai === ii || stripAccents(ai) === stripAccents(ii)) {
      if (ai !== a && ii === inp) return { ok: false, near: "Fast! Der Artikel fehlt." };
      if (ai === a && ii !== inp) return { ok: false, near: "Fast! Hier gehört kein Artikel dazu." };
      return { ok: false, near: "Fast! Der Artikel stimmt nicht." };
    }
  }
  for (const a of all) {
    if (a.length >= 5 && lev(stripAccents(a), stripAccents(inp)) === 1)
      return { ok: false, near: "Knapp! Ein Buchstabe stimmt nicht." };
  }
  return { ok: false };
}

// ======================================================================
// Oberfläche: gemeinsame Teile
// ======================================================================
const stage = $("stage");
let cur = null;
const mode = () => settings.mode;
const dir = () => settings.dir;
const MODE_NAMES = { card: "Vokabeln", mc: "Vokabeln", type: "Vokabeln", vb: "Verben", pp: "Passato-Übungen", build: "Sätze" };

function tryDots(used) {
  return Array.from({ length: MAX_TRIES }, (_, i) => `<span class="dot ${i < used ? "used" : ""}"></span>`).join("") +
    `<span class="sr-only">${used} von ${MAX_TRIES} Versuchen verbraucht</span>`;
}
function itSpan(t) { return `<span class="it" lang="it">${esc(t)}</span>`; }

function renderProgress() {
  const items = pool();
  const counts = Array(NBOX).fill(0); items.forEach(o => counts[rec(o.id).box - 1]++);
  const n = items.length || 1;
  $("leitner").innerHTML = counts.map((c, i) => `
    <div class="box ${i === NBOX - 1 ? "done" : ""}">
      <div class="fill" style="height:${c / n * 100}%"></div>
      <div class="n">${c}</div><div class="lab">${BOX_LABELS[i]}</div></div>`).join("");
  const due = items.filter(o => isDue(o.id)).length;
  $("meta").innerHTML = items.length
    ? `<span class="due">${due} heute fällig</span> · <b>${counts[NBOX - 1]}</b> von ${items.length} ${MODE_NAMES[mode()]} gefestigt`
    : "";
}

function showNext() {
  const chk = $("chk");
  if (chk) chk.outerHTML = `<button class="btn ghost" id="nx" type="button">Weiter →</button>`;
  $("nx").onclick = next;
  $("nx").focus({ preventScroll: true });
}

function emptyScreen(msg, canExtra) {
  stage.innerHTML = `<div class="empty">
      <div class="prompt">${canExtra ? "Bravissimo! 🎉" : "Niente qui…"}</div>
      <p class="sub">${msg}</p>
      ${canExtra ? `<div class="row"><button class="btn ghost" id="again" type="button">Extra-Runde üben</button></div>
      <p class="footnote">In der Extra-Runde verschiebt sich dein Lernplan nicht – nur Fehler holen ein Wort zurück in Fach 1.</p>` : ""}
    </div>`;
  if (canExtra) $("again").onclick = () => { extra = true; next(); };
}

function nextItem() {
  const items = pool();
  if (!items.length) {
    emptyScreen(`Für diese Auswahl gibt es noch keine ${MODE_NAMES[mode()]}. Wähle oben einen anderen Kurs oder eine andere Lektion.`, false);
    return null;
  }
  let it = pickDue(items);
  if (extra && (!it || it.id === lastId)) it = pickExtra(items) || it;   // Fehler aus der Extra-Runde nicht sofort wiederholen
  if (!it) { emptyScreen(`Alle fälligen ${MODE_NAMES[mode()]} für heute geschafft.`, true); return null; }
  lastId = it.id;
  return it;
}
const extraTag = () => cur && !isDue(cur.id) ? `<span class="extra-tag">Extra-Runde</span>` : "";

// Akzent-Tasten; getInput liefert das Feld, in das eingefügt wird
function accentBar(getInput) {
  const bar = document.createElement("div"); bar.className = "accents"; bar.setAttribute("aria-label", "Akzente einfügen");
  ["à", "è", "é", "ì", "ò", "ù"].forEach(ch => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = ch;
    b.onpointerdown = e => e.preventDefault();       // Tastatur auf dem Handy bleibt offen
    b.onclick = () => {
      const inp = getInput();
      if (!inp || inp.disabled) return;
      const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? s;
      inp.value = inp.value.slice(0, s) + ch + inp.value.slice(e);
      inp.focus(); inp.setSelectionRange(s + 1, s + 1);
    };
    bar.appendChild(b);
  });
  return bar;
}

// Eingabefeld + Akzent-Tasten + 3 Versuche (für Tippen, Passato, Verben)
function typingTask({ answers, lang, onDone, clean = s => s }) {
  let used = 0;
  const inp = $("ans"), fb = $("fb");
  if (lang === "it") inp.after(accentBar(() => inp));
  inp.focus();
  function check() {
    if (inp.disabled || !inp.value.trim()) return;
    const r = checkAnswer(clean(inp.value), answers, lang);
    if (r.ok) {
      fb.className = "feedback ok"; fb.innerHTML = used === 0 ? "Esatto!" : "Richtig – geschafft!";
      inp.disabled = true; onDone(used === 0 ? "good" : "hard", fb); showNext(); return;
    }
    used++; $("tries").innerHTML = tryDots(used);
    inp.classList.remove("shake"); void inp.offsetWidth; inp.classList.add("shake");
    if (used >= MAX_TRIES) {
      fb.className = "feedback no"; fb.innerHTML = "Richtig: <b>" + answers.map(a => lang === "it" ? itSpan(a) : esc(a)).join(" / ") + "</b>";
      inp.disabled = true; onDone("again", fb); showNext();
    } else {
      const left = MAX_TRIES - used;
      fb.className = r.near ? "feedback near" : "feedback no";
      fb.innerHTML = esc(r.near || "Nicht ganz.") + `<small>Noch ${left} ${left === 1 ? "Versuch" : "Versuche"}.</small>`;
      inp.focus(); inp.select();
    }
  }
  $("chk").onclick = check;
  inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); check(); } };
}

// ======================================================================
// Übungsarten
// ======================================================================
function renderCard() {
  cur = nextItem(); if (!cur) return;
  const it2de = dir() === "it2de";
  const front = it2de ? itSpan(itText(cur)) : esc(deText(cur));
  const back = it2de ? esc(deText(cur)) : itSpan(itText(cur));
  const note = hasGender(cur) ? `<div class="gender-note">m / w</div>` : "";
  stage.innerHTML = `${extraTag()}
    <div class="prompt-lab">${it2de ? "Italienisch → Deutsch" : "Deutsch → Italienisch"}</div>
    <div class="prompt">${front}</div>
    ${it2de ? note : ""}
    <div id="back" hidden>
      <div class="prompt">${back}</div>
      ${it2de ? "" : note}
      ${cur.ex ? `<div class="example" lang="it">„${esc(cur.ex)}“</div>` : ""}</div>
    <div class="row" id="cardrow"><button class="btn primary" id="flip" type="button">Umdrehen</button></div>`;
  $("flip").focus({ preventScroll: true });
  $("flip").onclick = () => {
    $("back").hidden = false;
    $("cardrow").innerHTML = `<button class="btn bad" id="no" type="button">Nochmal</button><button class="btn good" id="yes" type="button">Gewusst</button>`;
    $("yes").onclick = () => { grade(cur, "good"); next(); };
    $("no").onclick = () => { grade(cur, "again"); next(); };
    $("yes").focus({ preventScroll: true });
  };
}

function renderMC() {
  cur = nextItem(); if (!cur) return;
  const it2de = dir() === "it2de";
  const label = o => it2de ? deText(o) : itText(o);
  // Falsche Antworten möglichst aus derselben Wortart, ohne doppelte Beschriftung
  const seen = new Set([label(cur)]), wrongs = [];
  const cands = [...shuffle(VOCAB.filter(o => o.kat === cur.kat)), ...shuffle(VOCAB.filter(o => o.kat !== cur.kat))];
  for (const o of cands) { if (wrongs.length >= 3) break; if (o.id === cur.id || seen.has(label(o))) continue; seen.add(label(o)); wrongs.push(o); }
  const opts = shuffle([cur, ...wrongs]);
  stage.innerHTML = `${extraTag()}<div class="prompt-lab">Was heißt …?</div>
    <div class="prompt">${it2de ? itSpan(itText(cur)) : esc(deText(cur))}</div>
    <div class="choices" id="ch"></div><div class="feedback" id="fb"></div>`;
  const ch = $("ch"); let correctBtn = null;
  opts.forEach((o, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "choice";
    b.innerHTML = `<span class="sr-only">${i + 1}: </span>` + (it2de ? esc(label(o)) : itSpan(label(o)));
    if (o.id === cur.id) correctBtn = b;
    b.onclick = () => {
      [...ch.children].forEach(c => c.disabled = true);
      const fb = $("fb");
      if (o.id === cur.id) { b.classList.add("right"); grade(cur, "good"); fb.className = "feedback ok"; fb.textContent = "Bravo!"; }
      else {
        b.classList.add("wrong"); grade(cur, "again"); correctBtn.classList.add("right");
        fb.className = "feedback no"; fb.innerHTML = "Richtig: " + (it2de ? esc(deText(cur)) : itSpan(itText(cur)));
      }
      renderProgress();
      stage.insertAdjacentHTML("beforeend", `<div class="row"><button class="btn ghost" id="nx" type="button">Weiter →</button></div>`);
      $("nx").onclick = next; $("nx").focus({ preventScroll: true });
    };
    ch.appendChild(b);
  });
}

function renderType() {
  cur = nextItem(); if (!cur) return;
  const it2de = dir() === "it2de";
  stage.innerHTML = `${extraTag()}
    <div class="prompt-lab">Übersetze &amp; tippe</div>
    <div class="prompt">${it2de ? itSpan(itText(cur)) : esc(deText(cur))}</div>
    ${!it2de && hasGender(cur) ? `<div class="gender-note">m oder w – beides zählt</div>` : ""}
    <label class="sr-only" for="ans">Deine Übersetzung</label>
    <input class="fill-in" id="ans" placeholder="deine Übersetzung…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${it2de ? "" : 'lang="it"'}>
    <div class="tries" id="tries">${tryDots(0)}</div>
    <div class="feedback" id="fb" aria-live="assertive"></div>
    <div class="row"><button class="btn primary" id="chk" type="button">Prüfen</button></div>`;
  typingTask({
    answers: it2de ? cur.deList : cur.itList, lang: it2de ? "de" : "it",
    onDone: (res, fb) => {
      grade(cur, res); renderProgress();
      if (cur.ex) fb.insertAdjacentHTML("beforeend", `<small lang="it">„${esc(cur.ex)}“</small>`);
    }
  });
}

function renderPP() {
  cur = nextItem(); if (!cur) return;
  const q = cur;
  stage.innerHTML = `${extraTag()}
    <div class="prompt-lab">Passato Prossimo · Lücke füllen</div>
    <div class="pp-sentence" lang="it">${esc(q.pre)} <span class="pp-blank">&nbsp;____&nbsp;</span> ${esc(q.post)}</div>
    <div class="pp-hint">${esc(q.hint)}</div>
    <label class="sr-only" for="ans">Verbform im Passato Prossimo</label>
    <input class="fill-in" id="ans" placeholder="deine Antwort…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="it">
    <div class="tries" id="tries">${tryDots(0)}</div>
    <div class="feedback" id="fb" aria-live="assertive"></div>
    <div class="row"><button class="btn primary" id="chk" type="button">Prüfen</button></div>`;
  typingTask({
    answers: q.answers, lang: "it",
    onDone: (res, fb) => {
      grade(q, res); renderProgress();
      fb.insertAdjacentHTML("beforeend", `<small lang="it">${esc(q.pre)} <b>${esc(q.answers[0])}</b> ${esc(q.post)}</small>`);
    }
  });
}

function renderBuild() {
  cur = nextItem(); if (!cur) return;
  const q = cur;
  const solutions = [q.words, ...(q.alt || [])].map(w => w.join(" ").toLowerCase());
  // Großschreibung des ersten Wortes nicht verraten (außer bei Namen: "keepCase": true)
  const shown = q.words.map((w, i) => i === 0 && !q.keepCase ? w.charAt(0).toLowerCase() + w.slice(1) : w);
  const tiles = shuffle(shown.map((w, i) => ({ w, i })));
  let placed = [], used = 0, locked = false;
  stage.innerHTML = `${extraTag()}
    <div class="prompt-lab">Satz bauen</div>
    <div class="example" style="margin:6px 0 14px">„${esc(q.de)}“</div>
    <div class="build-target" id="tgt" lang="it" aria-label="Dein Satz"></div>
    <div class="build-pool" id="pool" lang="it" aria-label="Wörter"></div>
    <div class="tries" id="tries">${tryDots(0)}</div>
    <div class="feedback" id="fb" aria-live="assertive"></div>
    <div class="row"><button class="btn primary" id="chk" type="button">Prüfen</button></div>`;
  const poolEl = $("pool"), tgt = $("tgt"), fb = $("fb");
  const pretty = s => s.charAt(0).toUpperCase() + s.slice(1) + ".";
  function draw() {
    poolEl.innerHTML = ""; tgt.innerHTML = "";
    tiles.forEach(o => {
      if (placed.includes(o)) return;
      const b = document.createElement("button"); b.type = "button"; b.className = "word"; b.textContent = o.w; b.disabled = locked;
      b.onclick = () => { placed.push(o); draw(); }; poolEl.appendChild(b);
    });
    placed.forEach(o => {
      const b = document.createElement("button"); b.type = "button"; b.className = "word placed"; b.textContent = o.w; b.disabled = locked;
      b.onclick = () => { placed = placed.filter(x => x !== o); draw(); }; tgt.appendChild(b);
    });
  }
  draw();
  $("chk").onclick = () => {
    if (locked) return;
    if (placed.length < tiles.length) { fb.className = "feedback near"; fb.textContent = "Es fehlen noch Wörter."; return; }
    const got = placed.map(o => o.w).join(" ").toLowerCase();
    const idx = solutions.indexOf(got);
    if (idx >= 0) {
      fb.className = "feedback ok";
      fb.innerHTML = `Perfetto! <b lang="it">${esc(pretty(placed.map(o => o.w).join(" ")))}</b>` +
        (solutions.length > 1 ? `<small>Auch richtig: <span lang="it">${solutions.filter((_, i) => i !== idx).map(s => esc(pretty(s))).join(" · ")}</span></small>` : "");
      locked = true; draw(); grade(q, used === 0 ? "good" : "hard"); renderProgress(); showNext(); return;
    }
    used++; $("tries").innerHTML = tryDots(used);
    if (used >= MAX_TRIES) {
      fb.className = "feedback no"; fb.innerHTML = `Richtig: <b lang="it">${esc(pretty(q.words.join(" ")))}</b>`;
      locked = true; draw(); grade(q, "again"); renderProgress(); showNext();
    } else {
      const left = MAX_TRIES - used; fb.className = "feedback no";
      fb.innerHTML = `Noch nicht richtig – sortier nochmal.<small>Noch ${left} ${left === 1 ? "Versuch" : "Versuche"}.</small>`;
    }
  };
}

// ---------- Verben konjugieren (Presente) ----------
const PRON = ["io", "tu", "lui / lei", "noi", "voi", "loro"];
// „io lavoro“ zählt genauso wie „lavoro“
const stripPron = s => s.replace(/^\s*(io|tu|lui|lei|lui\s*\/\s*lei|noi|voi|loro)\s+/i, "");

function verbHead(v, lab) {
  return `${extraTag()}<div class="prompt-lab">${lab}</div>
    <div class="prompt">${itSpan(v.inf)}</div>
    <div class="pp-hint">${esc(v.de)}${v.gruppe ? " · " + esc(v.gruppe) : ""}</div>`;
}

function renderVerbOne() {
  cur = nextItem(); if (!cur) return;
  const v = cur, p = Math.floor(Math.random() * 6);
  stage.innerHTML = verbHead(v, "Konjugiere · Presente") + `
    <div class="pp-sentence" lang="it"><b>${PRON[p]}</b> <span class="pp-blank">&nbsp;____&nbsp;</span></div>
    <label class="sr-only" for="ans">Verbform für ${PRON[p]}</label>
    <input class="fill-in" id="ans" placeholder="Verbform…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="it">
    <div class="tries" id="tries">${tryDots(0)}</div>
    <div class="feedback" id="fb" aria-live="assertive"></div>
    <div class="row"><button class="btn primary" id="chk" type="button">Prüfen</button></div>`;
  typingTask({
    answers: [v.forms[p]], lang: "it", clean: stripPron,
    onDone: (res, fb) => {
      grade(v, res); renderProgress();
      fb.insertAdjacentHTML("beforeend", `<small lang="it">${v.forms.map((f, i) => i === p ? `<b>${esc(f)}</b>` : esc(f)).join(" · ")}</small>`);
    }
  });
}

function renderVerbTable() {
  cur = nextItem(); if (!cur) return;
  const v = cur;
  stage.innerHTML = verbHead(v, "Konjugiere die ganze Tabelle") + `
    <div class="conj" id="conj">${PRON.map((p, i) => `
      <label class="conj-row" for="c${i}"><span class="pron" lang="it">${p}</span>
        <input id="c${i}" class="conj-in" lang="it" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="${i < 5 ? "next" : "done"}">
        <span class="mark" id="m${i}" aria-hidden="true"></span></label>`).join("")}</div>
    <div class="tries" id="tries">${tryDots(0)}</div>
    <div class="feedback" id="fb" aria-live="assertive"></div>
    <div class="row"><button class="btn primary" id="chk" type="button">Prüfen</button></div>`;
  const ins = PRON.map((_, i) => $("c" + i)), fb = $("fb");
  let last = ins[0], used = 0;
  ins.forEach((inp, i) => {
    inp.onfocus = () => { last = inp; };
    inp.onkeydown = e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const nxt = ins.slice(i + 1).find(x => !x.disabled);
      if (nxt) nxt.focus(); else check();
    };
  });
  $("conj").after(accentBar(() => last));
  ins[0].focus();

  function check() {
    const open = ins.filter(x => !x.disabled);
    if (open.some(x => !x.value.trim())) { fb.className = "feedback near"; fb.textContent = "Bitte alle Formen ausfüllen."; return; }
    const hints = [];
    open.forEach(inp => {
      const i = ins.indexOf(inp), r = checkAnswer(stripPron(inp.value), [v.forms[i]], "it");
      inp.parentElement.classList.remove("bad", "ok");
      if (r.ok) { inp.disabled = true; inp.parentElement.classList.add("ok"); $("m" + i).textContent = "✓"; }
      else { inp.parentElement.classList.add("bad"); $("m" + i).textContent = "✗"; if (r.near) hints.push(`${PRON[i]}: ${r.near.replace(/^(Fast|Knapp)! /, "")}`); }
    });
    const wrong = ins.filter(x => !x.disabled);
    if (!wrong.length) {
      fb.className = "feedback ok"; fb.textContent = used === 0 ? "Perfetto! Alles richtig." : "Geschafft – alles richtig!";
      grade(v, used === 0 ? "good" : "hard"); renderProgress(); showNext(); return;
    }
    used++; $("tries").innerHTML = tryDots(used);
    if (used >= MAX_TRIES) {
      wrong.forEach(inp => { const i = ins.indexOf(inp); inp.value = v.forms[i]; inp.disabled = true; inp.parentElement.classList.replace("bad", "sol"); });
      fb.className = "feedback no"; fb.innerHTML = "Die richtigen Formen sind jetzt eingetragen (rot markiert).";
      grade(v, "again"); renderProgress(); showNext();
    } else {
      const left = MAX_TRIES - used;
      fb.className = hints.length ? "feedback near" : "feedback no";
      fb.innerHTML = `${ins.length - wrong.length} von 6 richtig.` + (hints.length ? `<small>${esc(hints.join(" · "))}</small>` : "") +
        `<small>Noch ${left} ${left === 1 ? "Versuch" : "Versuche"}.</small>`;
      wrong[0].focus(); wrong[0].select();
    }
  }
  $("chk").onclick = check;
}
const renderVerb = () => settings.vm === "one" ? renderVerbOne() : renderVerbTable();

const renderers = { card: renderCard, mc: renderMC, type: renderType, vb: renderVerb, pp: renderPP, build: renderBuild };
function next() {
  renderProgress();
  $("dirbar").style.display = ["card", "mc", "type"].includes(mode()) ? "flex" : "none";
  $("vmbar").style.display = mode() === "vb" ? "flex" : "none";
  renderers[mode()]();
}
function resetSession() { extra = false; lastId = null; }

// ======================================================================
// Bedienelemente
// ======================================================================
function syncPressed() {
  document.querySelectorAll("nav button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode())));
  document.querySelectorAll("#dirbar button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.dir === dir())));
  document.querySelectorAll("#vmbar button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.vm === settings.vm)));
}
document.querySelectorAll("nav button").forEach(b => b.onclick = () => {
  settings.mode = b.dataset.mode; saveSettings(); resetSession(); syncPressed(); next();
});
document.querySelectorAll("#dirbar button").forEach(b => b.onclick = () => {
  settings.dir = b.dataset.dir; saveSettings(); syncPressed(); next();
});
document.querySelectorAll("#vmbar button").forEach(b => b.onclick = () => {
  settings.vm = b.dataset.vm; saveSettings(); syncPressed(); next();
});
$("fKurs").onchange = e => { settings.kurs = e.target.value; settings.lek = ALL; saveSettings(); resetSession(); renderFilter(); next(); };
$("fLek").onchange = e => { settings.lek = e.target.value; saveSettings(); resetSession(); next(); };

// Tasten 1–4 in „Auswahl“
document.addEventListener("keydown", e => {
  if (mode() !== "mc" || e.target.tagName === "INPUT" || e.ctrlKey || e.metaKey || e.altKey) return;
  const n = parseInt(e.key, 10), btns = document.querySelectorAll("#ch .choice");
  if (n >= 1 && n <= btns.length && !btns[n - 1].disabled) btns[n - 1].click();
});

// ---------- Profil-Dialog ----------
const dlg = $("profileDlg");
function askProfile(firstRun) {
  const known = knownProfiles().filter(p => p !== profile);
  $("knownProfiles").innerHTML = known.map(p => `<button type="button" data-p="${esc(p)}">${esc(p)}</button>`).join("");
  $("knownProfiles").querySelectorAll("button").forEach(b => b.onclick = () => setProfile(b.dataset.p));
  $("dlgTitle").textContent = firstRun ? "Ciao! Come ti chiami?" : "Profil wechseln";
  $("profileCancel").hidden = firstRun;
  $("profileInput").value = ""; $("profileErr").textContent = "";
  dlg.showModal(); $("profileInput").focus();
}
function setProfile(name) {
  profile = name; store.set(PROFILE_KEY, profile);
  $("pname").textContent = profile;
  loadProgress(); resetSession(); dlg.close(); next();
}
$("profileForm").onsubmit = e => {
  e.preventDefault();
  const n = $("profileInput").value.trim();
  if (!n) { $("profileErr").textContent = "Bitte gib einen Namen ein."; return; }
  setProfile(n);
};
$("profileCancel").onclick = () => dlg.close();
dlg.addEventListener("cancel", e => { if (!profile) e.preventDefault(); });   // erster Start: Name ist Pflicht
$("switch").onclick = () => askProfile(false);

// ---------- Sichern / Wiederherstellen ----------
$("exportBtn").onclick = () => {
  const data = { app: "italiano-vhs-app", version: 2, profile, exported: new Date().toISOString(), progress };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  a.download = `italiano-fortschritt-${profile}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== "italiano-vhs-app" || typeof data.progress !== "object") throw new Error();
    const when = data.exported ? new Date(data.exported).toLocaleDateString("de-DE") : "?";
    if (!confirm(`Fortschritt von „${data.profile}“ (Stand ${when}) in dein Profil „${profile}“ übernehmen?\nDein aktueller Stand auf diesem Gerät wird ersetzt.`)) return;
    store.set(STATE_PREFIX + profile, JSON.stringify(data.progress));
    loadProgress(); resetSession(); next();
    alert("Fortschritt wiederhergestellt.");
  } catch { alert("Diese Datei ist keine gültige Sicherung der App."); }
};

// ---------- Installieren (PWA) ----------
(function installHint() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone || store.get("italiano_install_dismissed")) return;
  const box = $("install");
  $("installX").onclick = () => { box.classList.remove("show"); store.set("italiano_install_dismissed", "1"); };
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); deferred = e; box.classList.add("show");
  });
  $("installBtn").onclick = async () => {
    if (!deferred) return;
    deferred.prompt(); await deferred.userChoice; deferred = null; box.classList.remove("show");
  };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) {
    $("installText").innerHTML = "Als App installieren: unten auf <b>Teilen</b> tippen, dann <b>„Zum Home-Bildschirm“</b>.";
    $("installBtn").hidden = true; box.classList.add("show");
  }
})();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// ======================================================================
// Start
// ======================================================================
(async function init() {
  try { await loadContent(); }
  catch {
    stage.innerHTML = `<div class="empty"><div class="prompt">Ops!</div><p class="sub">Die Inhalte konnten nicht geladen werden. Bitte die Seite neu laden${location.protocol === "file:" ? " – oder die App über die Web-Adresse öffnen statt als Datei" : ""}.</p></div>`;
    return;
  }
  renderFilter(); syncPressed();
  if (profile) { $("pname").textContent = profile; loadProgress(); next(); }
  else { renderProgress(); askProfile(true); }
})();
