# Ripassa l'italiano – Übungs-App für den VHS-Kurs A1

Vokabeln, Passato prossimo und Satzbau aus dem Kurs wiederholen – im Browser, auf dem Handy als App installierbar, auch offline.

**App öffnen:** https://francis-grace.github.io/italiano-vhs-app/

## Auf dem Handy installieren

- **iPhone (Safari):** Seite öffnen → *Teilen* → *Zum Home-Bildschirm*
- **Android (Chrome):** Seite öffnen → Hinweis „Installieren“ antippen (oder Menü ⋮ → *App installieren*)

Der Fortschritt wird nur auf dem jeweiligen Gerät gespeichert. Mit *Fortschritt sichern* / *Wiederherstellen* lässt er sich auf ein anderes Gerät mitnehmen.
Hinweis fürs iPhone: Die installierte App und Safari haben getrennte Speicher – am besten nur noch die installierte App nutzen.

## So funktioniert das Lernen

Jeder Eintrag liegt in einem von 5 Fächern. Er kommt wieder dran nach:

| Fach | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| wieder fällig | sofort | 1 Tag | 3 Tagen | 7 Tagen | 21 Tagen |

Sofort gewusst → ein Fach höher. Mit Fehlversuchen geschafft → Fach bleibt, morgen wieder. Nicht gewusst → zurück in Fach 1.
Sind alle fälligen Einträge erledigt, gibt es eine *Extra-Runde*, die den Lernplan nicht verschiebt.

---

## Neues Kursmaterial einpflegen

Alle Inhalte stehen in `data/`. Jeder Eintrag braucht `kurs`, optional `lektion` (Zahl oder Text, z. B. `1` oder `"Stunde 2"`). Über die Auswahl *Kurs* / *Lektion* oben in der App lässt sich gezielt üben.

### `data/vocab.json`

```json
{"it": "studiare", "de": ["studieren", "lernen"], "ex": "Voi studiate biologia.", "kat": "verb", "kurs": "A1.3", "lektion": 1}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `it` | ✔ | Italienisch, Nomen **mit Artikel** (`il libro`, `l'amica`) |
| `itF` | | weibliche Form (`bianco` → `"itF": "bianca"`) |
| `de` | ✔ | Deutsch; mehrere richtige Antworten als Liste. Klammern sind optional beim Tippen: `"besuchen (einen Kurs)"` – „besuchen“ zählt auch |
| `deF` | | weibliche deutsche Form (`der Lehrer` → `"deF": "die Lehrerin"`) |
| `ex` | empfohlen | Beispielsatz auf Italienisch |
| `kat` | ✔ | `nomen`, `verb`, `adjektiv`, `adverb`, `wochentag`, `ausdruck`, `zahl`, `sonstiges` – für passende Auswahl-Antworten |
| `kurs` | ✔ | z. B. `"A1.3"` |
| `lektion` | | z. B. `1` oder `"Stunde 2"` |
| `id` | | nur nötig, wenn zwei Einträge sonst gleich hießen. **`it` bestehender Einträge nicht ändern** – daran hängt der Fortschritt (sonst vorher `"id"` mit dem alten Wert setzen) |

### `data/verbs.json` (Übung „Verben“)

```json
{"inf": "cercare", "de": "suchen", "forms": ["cerco", "cerchi", "cerca", "cerchiamo", "cercate", "cercano"], "gruppe": "-are", "kurs": "A1.1"}
```

`forms` = genau 6 Formen im Presente in der Reihenfolge io, tu, lui/lei, noi, voi, loro. `gruppe` ist nur ein Hinweis für die Anzeige (z. B. `-are`, `-ire (-isc-)`, `unregelmäßig`).
Geübt wird als ganze Tabelle oder als einzelne Form; „io lavoro“ und „lavoro“ zählen beide.

### `data/passato.json`

```json
{"pre": "Ieri", "post": "al cinema.", "answers": ["sono andato", "sono andata"], "hint": "andare · io", "kurs": "A1.3", "lektion": 2}
```

### `data/sentences.json`

```json
{"words": ["Il", "sabato", "gioco", "a", "tennis"], "alt": [["Gioco", "a", "tennis", "il", "sabato"]], "de": "Am Samstag spiele ich Tennis.", "kurs": "A1.3"}
```

`words` ohne Satzzeichen am Ende. `alt` = weitere richtige Reihenfolgen (optional). Beginnt der Satz mit einem Namen, `"keepCase": true` setzen.

### Ablauf

1. Unterlagen der Stunde (Fotos/PDF) an Claude im Projekt „Italienisch-Lern-App“ geben → Claude erstellt die Einträge nach diesem Schema.
2. Einträge am Ende der jeweiligen Datei ergänzen.
3. Prüfen: `node scripts/validate.mjs` (läuft auch automatisch bei jedem Commit auf GitHub).
4. Committen → GitHub prüft und veröffentlicht automatisch. Ist etwas falsch, bleibt die alte Version online und GitHub zeigt unter *Actions* den Fehler.

## Lokal testen

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen (Doppelklick auf index.html funktioniert nicht)
```

## Einmalige Einrichtung von GitHub Pages

Repository → *Settings* → *Pages* → *Source:* **GitHub Actions**. Danach veröffentlicht jeder Commit auf `master` automatisch.

## Lizenzen

Schriften Fraunces und DM Sans: SIL Open Font License 1.1 (siehe `fonts/`).
