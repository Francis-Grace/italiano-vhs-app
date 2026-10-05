// Prüft die Inhaltsdateien vor dem Veröffentlichen.  Aufruf:  node scripts/validate.mjs
import { readFileSync } from "node:fs";

const KATS = ["nomen", "verb", "adjektiv", "adverb", "wochentag", "ausdruck", "zahl", "sonstiges"];
const errors = [], warnings = [];
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
const str = x => typeof x === "string" && x.trim() !== "";
const strOrList = x => str(x) || (Array.isArray(x) && x.length > 0 && x.every(str));

function load(file) {
  try { const d = JSON.parse(readFileSync(file, "utf8")); if (!Array.isArray(d)) throw new Error("ist keine Liste [ … ]"); return d; }
  catch (e) { errors.push(`${file}: kein gültiges JSON – ${e.message}`); return []; }
}
function common(file, i, o, label) {
  const where = `${file} #${i + 1} (${label})`;
  if (!str(o.kurs)) errors.push(`${where}: "kurs" fehlt`);
  if (o.lektion != null && !(str(o.lektion) || Number.isInteger(o.lektion))) errors.push(`${where}: "lektion" muss Zahl oder Text sein`);
  return where;
}

// ---------- Vokabeln ----------
const vocab = load("data/vocab.json"), ids = new Map();
vocab.forEach((v, i) => {
  const w = common("vocab.json", i, v, v.it ?? "?");
  if (!str(v.it)) errors.push(`${w}: "it" fehlt`);
  if (!strOrList(v.de)) errors.push(`${w}: "de" fehlt (Text oder Liste)`);
  if (typeof v.de === "string" && /\s\/\s/.test(v.de)) warnings.push(`${w}: Alternativen bitte als Liste schreiben: ["…", "…"]`);
  if (!KATS.includes(v.kat)) errors.push(`${w}: "kat" muss eins von ${KATS.join(", ")} sein`);
  if (!str(v.ex)) warnings.push(`${w}: kein Beispielsatz ("ex")`);
  const id = v.id || slug(v.it || "");
  if (ids.has(id)) errors.push(`${w}: doppelt bzw. gleiche ID wie „${ids.get(id)}“ – Eintrag zusammenführen oder eigenes "id" vergeben`);
  ids.set(id, v.it);
});

// ---------- Passato ----------
const pp = load("data/passato.json"), ppIds = new Set();
pp.forEach((p, i) => {
  const w = common("passato.json", i, p, `${p.pre} … ${p.post}`);
  ["pre", "post", "hint"].forEach(k => { if (typeof p[k] !== "string") errors.push(`${w}: "${k}" fehlt`); });
  if (!Array.isArray(p.answers) || !p.answers.every(str)) errors.push(`${w}: "answers" muss eine Liste sein`);
  const id = p.id || slug(`${p.pre} ${p.post}`);
  if (ppIds.has(id)) errors.push(`${w}: doppelt`); ppIds.add(id);
});

// ---------- Sätze ----------
const sent = load("data/sentences.json"), sIds = new Set();
const bag = ws => ws.map(x => x.toLowerCase()).sort().join("|");
sent.forEach((s, i) => {
  const w = common("sentences.json", i, s, (s.words || []).join(" "));
  if (!Array.isArray(s.words) || s.words.length < 2 || !s.words.every(str)) { errors.push(`${w}: "words" muss eine Liste mit Wörtern sein`); return; }
  if (s.words.some(x => /[.!?]$/.test(x))) warnings.push(`${w}: Satzzeichen am Ende weglassen (wird automatisch ergänzt)`);
  if (!str(s.de)) errors.push(`${w}: "de" fehlt`);
  (s.alt || []).forEach((a, k) => {
    if (!Array.isArray(a) || bag(a) !== bag(s.words)) errors.push(`${w}: "alt" #${k + 1} muss genau dieselben Wörter enthalten`);
  });
  const id = s.id || slug(s.words.join(" "));
  if (sIds.has(id)) errors.push(`${w}: doppelt`); sIds.add(id);
});

// ---------- Verben ----------
const verbs = load("data/verbs.json"), vIds = new Set();
verbs.forEach((v, i) => {
  const w = common("verbs.json", i, v, v.inf ?? "?");
  if (!str(v.inf)) errors.push(`${w}: "inf" fehlt`);
  if (!str(v.de)) errors.push(`${w}: "de" fehlt`);
  if (!Array.isArray(v.forms) || v.forms.length !== 6 || !v.forms.every(str))
    errors.push(`${w}: "forms" braucht genau 6 Formen (io, tu, lui/lei, noi, voi, loro)`);
  const id = v.id || slug(v.inf || "");
  if (vIds.has(id)) errors.push(`${w}: doppelt`); vIds.add(id);
});

// ---------- Ergebnis ----------
const kurse = {};
[...vocab, ...verbs, ...pp, ...sent].forEach(o => { kurse[o.kurs] = (kurse[o.kurs] || 0) + 1; });
console.log(`Vokabeln: ${vocab.length} · Verben: ${verbs.length} · Passato: ${pp.length} · Sätze: ${sent.length}`);
console.log("Pro Kurs:", Object.entries(kurse).map(([k, n]) => `${k}: ${n}`).join(" · "));
warnings.forEach(m => console.log("⚠️  " + m));
errors.forEach(m => console.log("❌ " + m));
if (errors.length) { console.log(`\n${errors.length} Fehler – bitte korrigieren.`); process.exit(1); }
console.log("\n✅ Alles in Ordnung.");
