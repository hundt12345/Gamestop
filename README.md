# GameStop / Event Tape

Ein visueller Prototyp für eine quellenverlinkte Chronik der GameStop-Ereignisse ab 2020. Der Hauptscreen ist ein horizontaler, Webull-inspirierter Chart: der neueste Punkt liegt rechts, per Drag/Scroll geht es nach links in die Vergangenheit — und der Chart lässt sich stufenlos bis auf einzelne Handelstage hineinzoomen. Jedes Ereignis klappt als Karte direkt am Kurs auf.

## Support-Button einrichten (Ko-fi / Patreon)

Der Support-Button (Header, `#support`-Sektion, Footer) ist vorbereitet, aber bewusst noch nicht mit einem echten Konto verknüpft. Einrichtung in ca. 5 Minuten:

1. **Plattform wählen & Konto anlegen** — Empfehlung für einen simplen Tip-Button: [Ko-fi](https://ko-fi.com) (kostenlos starten, 0 % Plattformgebühr auf Tips, Auszahlung per PayPal/Stripe). Wer Mitgliedschafts-Stufen mit exklusiven Inhalten will, nimmt stattdessen [Patreon](https://www.patreon.com); die simpelste Alternative ist Buy Me a Coffee.
2. **Seite erstellen** — z. B. `ko-fi.com/DEINNAME`, kurzen Text zum Archiv einfügen, Zahlungsart verbinden. Bei Patreon zusätzlich 1–3 Membership-Tiers anlegen.
3. **URL eintragen** — in `app.js` ganz oben bei `SUPPORT` die Adresse einsetzen:
   ```js
   const SUPPORT = {
     provider: 'Ko-fi',
     url: 'https://ko-fi.com/DEINNAME' // oder patreon.com/DEINNAME
   };
   ```
4. **Deployen** — speichern und wie gewohnt ausliefern. Alle drei Buttons verlinken dann automatisch extern auf deine Seite. Solange `url` leer ist, führt der Button nur zur Erklär-Sektion `#support` — kein toter Link.

## Lokal starten

```bash
npm start
```

Danach läuft die Seite unter `http://localhost:3000`.

## Auf Render Free deployen

Das Repository enthält ein `render.yaml` für einen kostenlosen Render Web Service:

1. Repository auf GitHub pushen bzw. in Render verbinden.
2. In Render **New → Blueprint** auswählen und das Repository angeben.
3. Render liest `render.yaml`, installiert mit `npm install` und startet mit `npm start`.

Der Server bindet auf `0.0.0.0` und verwendet automatisch `process.env.PORT`, damit der Free-Tier-Service direkt erreichbar ist.

## Kursdaten

`market-data.js` enthält die realen GME-Tageskerzen (Open/High/Low/Close/Volume) seit Dezember 2019, jeweils so quotiert, wie sie damals gehandelt wurden.

- **Standardansicht ist split-bereinigt:** der 4:1-Split vom 22. Juli 2022 wird rückwirkend herausgerechnet (alle Kurse davor durch 4 geteilt, Volumen × 4), damit die Kurve über den Split hinweg vergleichbar bleibt. Der Knopf `SPLIT-ADJ ↔ AS TRADED` in der `ANZEIGE`-Leiste im Chart schaltet um — Event-Karten, Kurs-Inspektor, TA-Layer und Meme-Preise folgen mit.
- Aktualisieren: `node scripts/fetch-market-data.mjs` (Quelle: Yahoo-Finance-Chart-API, Tagesintervalle inkl. Split-Events).
- Automatisch: `.github/workflows/refresh-market-data.yml` läuft monatlich, bei Workflow-Änderungen und auf Knopfdruck (`workflow_dispatch`) und committet die neue Fassung.
- Fällt `market-data.js` aus, baut das Frontend eine grobe Ersatzlinie aus den dokumentierten Schlusskursen, damit der Chart nie leer bleibt.

## Neu: der Tape-Stand von 2025/26, TA-Desk und Zahlenschloss

Die Chronik endet nicht mehr im März 2025. Aufgenommen sind jetzt die Ereignisse, die das Tape seitdem bewegt haben:

- **März 2025** — Bitcoin wird als Treasury-Reserve-Asset beschlossen, dazu Convertible Notes als Finanzierung.
- **Mai/Juni 2025** — Kauf von **4.710 BTC** (rund $500 Mio.) und die auf **$2,25 Mrd.** aufgestockte Nullzins-Anleihe.
- **Januar/März 2026** — der BTC-Transfer zu Coinbase Prime ($420 Mio., „Verkauf?“) und das 10-K, das ihn als **Covered-Call-Strategie** erklärt: 4.709 BTC verpfändet, $368,3 Mio. als Receivable, dazu **$418,4 Mio. Jahresgewinn**, $597,3 Mio. Free Cash Flow und **$9,01 Mrd. Cash & Securities**.
- **Mai 2026** — das **$56-Mrd.-Gebot** auf eBay ($125/Aktie, halb Cash, halb Aktie) und die Absage des eBay-Boards („neither credible nor attractive“), danach der Rückzug auf eine Partnerschaft bei 9,75 % Anteil.
- **Juni 2026** — **Rekordquartal** ($389,6 Mio. Nettogewinn, Collectibles 41,8 % vom Umsatz) und ein **$2-Mrd.-Buyback**.
- **Sept./Okt. 2026** — **Warrant-Dividende** (1 je 10 Aktien, Strike $32, Auslauf 30.10.2026, bis zu $1,9 Mrd.), Wiedereröffnung geschlossener Stores und eine laufende **Insider-Kaufserie** von Ryan Cohen (>$97 Mio. seit September).

Jede dieser Zeilen ist im Archiv als Chart-Layer markiert (`₿` Bitcoin, `⇄` M&A, `W` Warrant) und mit Primärquelle verlinkt; die Timeline-Sektion hat dafür fünf neue Anker-Karten und endet jetzt im Oktober 2026.

## TA-Desk, Zahlenschloss und Codes („Meme-Gott-Modus“)

- **TA / DD DESK** (Knopf `TA / DD DESK`, Chip `HYPE …` in der Subbar oder Link in der Navigation) ersetzt die alte, illustrierte „Community-Triangles“-Ebene. Gezeichnet wird nur noch, was aus `market-data.js` **gerechnet** ist: **SMA 50 / SMA 200** als echte Linien, **52-Wochen-Hoch/Tief**, **Volumen-Regale** (die drei Kurszonen mit dem meisten Volumen der letzten ~260 Sitzungen) und **Anchored VWAPs** seit dem Januar-2021-Peak, dem RK-Comeback und dem War-Chest-Print. Dazu ein Kennzahlen-Block (RSI 14, realisierte Vol, Volumen-Verhältnis, Abstand zum Januar-2021-Print). Die Kult-Level **$483 / $69 / $20** sind als **LORE** beschriftet und werden nie als gerechnete Marke ausgegeben — umschaltbar per Code `69`.
- **Community Reads** stehen direkt daneben: Superstonk (TA-Feed + DD-Wiki), **James Roland / @JRoland_ („The $GME Meltup Guy“, memestockwatch.com)**, GMEDD, Roaring Kitty und SEC EDGAR — jeweils mit Link und einem Satz, was die Quelle liefert. Keine Empfehlung, keine Kursziele.
- **Zahlenschloss (`★ MEME NUMBERS`)**: eine echte Regel-Engine über das gedruckte Tape. Sie taggt jede Sitzung, die eine Kult-Zahl gedruckt hat — `$483.00` (das exakte All-Time-High vom 28.01.2021, genau **einmal** im Tape), Schlusskurse auf `x.69` (20×) und `x.42` (15×), glatte Dollarbeträge ab $20 (28×) und Schlüsse auf $4.20/$24.20/$42.00 (5×) — insgesamt **69 Treffer**. Sterne sitzen auf dem jeweiligen Schlusskurs, die Detailkarte nennt die Regel im Klartext und die Treffer-Position.
- **HYPE-INDEX**: ein Stimmungsbarometer aus vier gerechneten Bestandteilen (Volumen vs. 60-Tage-Schnitt, Perzentil der realisierten Volatilität, Anteil ≥4-%-Tage der letzten 20 Sitzungen, Abstand zum 52-Wochen-Hoch) mit Labels von `QUIET` bis `UNHINGED`. Ausdrücklich eine Stimmung, keine Prognose.
- **Versteckte Codes**: einfach tippen, ohne in ein Feld zu schreiben — `741`, `483`, `0042`, `BTC`, `EBAY`, `WS` springen zu den passenden Tagen, `420` schaltet das Zahlenschloss, `69` die Lore-Level, `TA` den Desk, `RC` die Tweet-Ebene, `TENDIEMAN` und `CAT` spielen die Memes im Dock, `MOON` lässt Raketen steigen. `?` oder der Knopf `⌨ CODES` öffnet die Liste; die Hero-Zeile verrät, dass es sie gibt.
- **Legende in der Subbar**: ein Zeichen pro Marker-Typ (Event, Meme, Corporate, Tweet, Meme Number) — damit ist auf einen Blick klar, was auf dem Tape liegt. Rechts daneben sitzt der klickbare Hype-Chip.

## Im Entwurf enthalten

- Full-screen chart surface mit dem echten GME-Tape 2019 — heute; neuester Punkt startet rechts auf dem Playhead, **stark hereingezoomt: beim Laden sind maximal ca. ein Monat Tape sichtbar** (rund 21 Handelstage) — erst `FIT` oder Herauszoomen öffnet die ganze Historie
- **DOCK statt Overlay:** Ereignis-Karte, Meme-Player und Cursor-OHLC liegen in einem eigenen Bereich **unterhalb** der Kursfläche — keine Einblendung liegt mehr über dem Chart. Zwei Marker am oberen Rand des Docks (grün = Ereignis, blau = Meme) zeigen exakt, zu welchem Kurs die Karte gehört; `HIDE DOCK` klappt den Bereich weg, dann nutzt der Chart wieder die volle Höhe.
- **Klick in den Chart zeigt den Kurs:** ein Klick an eine beliebige Stelle setzt ein Crosshair auf den nächstgelegenen Handelstag und legt Datum, Open/High/Low/Close, Volumen und Tagesänderung in den dritten Dock-Slot — plus den exakten Kurs an der geklickten Höhe als Flagge an der Preisskala (Esc schließt)
- **Split-bereinigte Kurse als Standard** mit Umschalter auf `AS TRADED` (siehe oben)
- stufenloses Zoom: `+` / `−` / `FIT` (Anfangsfenster ≈ ein Monat), Strg- oder Shift-Scroll, Doppelklick zentriert das nächste Ereignis, auf Touch zwei Finger zum Pinch-Zoom
- **ruhige Topbar:** oben liegen nur noch Navigation (←/→), Zoom und die Auflösung `1D / 1W / 1M`; alles Weitere (Split-Modus, MEMES, LINE↔CANDLES, Technical Analysis, MEDIA) steckt hinter dem Knopf `ANZEIGE ▾` und ist standardmäßig eingeklappt — ebenso das `CHART LAYERS`-Panel
- horizontaler Drag, Mousewheel-Scroll, Range-Scrubber, ältere/neuere Navigation, Pfeiltasten und Sprünge zu 2020 / Jan 2021 / 2022 / 2024
- umschaltbare Darstellung zwischen LINE und CANDLES
- **28 Memes an echten Handelstagen:** blaue `M1 ▶` … `M28 ▶` Marker hängen am Tape (RC-Einstieg, Letter, Board-Sitz, DFV, **Tendieman-Sea-Shanty (Jan 2021, eigenes Video-Meme)**, YOLO, **Katzenmemes (Popcat / Typing Cat / Wake-Up Cat)** sowie „I am not a cat“ aus der Anhörung, To the Moon, Diamond Hands, Squeeze, Buy-Button, Top of Tape, Anhörung, Dumb Money, Hold the Line, AMC, Superstonk, AMC-Stake, Split, erster Gewinn, Roaring-Kitty-Comeback, Livestream 2024, dazu die neuen Karten **4,710 ₿** (Mai 2025), **The $56B bid** (Mai 2026) und **Free lottery tickets** (Warrant-Dividende 2026) als reine Text-Karten ohne Einbettung). Klick spielt den Moment im Dock ab mit Play/Pause, Fortschritt und Loop — der MEMES-Knopf blendet die Marker ein/aus, und die Auswahl im Meme-Tape unten springt mit ins Chart
- **echte GIF- und Video-Einbettungen statt Platzhalter:** die GIFs laufen direkt von Giphy (u. a. „I am not a cat“ aus der Anhörung, Paul Dano aus *Dumb Money*, „Buy Now“ als Buy-Button, Hold-the-Line, Jim Cramer), die Videos über den `youtube-nocookie`-Player (beide Kanäle der Anhörung vom 18.02.2021, Roaring Kittys Livestream vom 07.06.2024 und sein „Cheers Everyone!“ vom 16.04.2021). Der Video-Player startet erst auf Klick, die GIFs auf der Wand erst beim Scrollen in den Bereich — und jede Einbettung verlinkt auf ihren Original-Post
- `MEDIA ON/OFF` in der `ANZEIGE`-Leiste schaltet alle Einbettungen ab: der Player bleibt dann rein textlich und löst keinen einzigen externen Request aus
- Meme-Wand mit allen 22 Momenten plus Clip-Rail mit den Originalaufnahmen (u. a. Tendieman, Anhörung, „Cheers Everyone!“, Livestream 2024) im Meme-Tape — beides bewusst weit weg vom Chart
- **Einklappbarer Chart-Layer (`CHART LAYERS` unter der Subbar):** 36 Unternehmens-Ereignisse als Rauten direkt auf der Kurslinie — Earnings (z. B. erster Gewinn Q4 2022, Rekordquartal Juni 2026), Offerings/ATMs (u. a. $933.4M im Mai 2024, $2.137 Mrd. im Juni 2024, $2,25 Mrd. Convertibles 2025), der Bitcoin-Treasury-Strang (`₿`, u. a. 4.710 BTC, Coinbase-Covered-Call), M&A (`⇄`, eBay-Gebot und Absage) und die Warrant-Dividende (`W`) — filterbar nach EARNINGS / OFFERING / BITCOIN / M&A / OTHER, plus **9 RC-Tweets** als 𝕏-Chips und das **Zahlenschloss** (`★ MEME NUMBERS`) mit 69 getaggten Sitzungen. Klick auf Marker oder Listeneintrag öffnet das Panel und zeigt Kurs, Tagesänderung, Text und Primärquelle direkt in der Detailkarte (leuchtet kurz auf); `CHART LAYERS ▾` klappt das Panel wieder weg — es startet eingeklappt
- **Direktsprünge im Layer-Panel und im Meme-Tape:** `♪ TENDIEMAN`, `🐱 KATZENMEMES` und `🐱 NOT A CAT` spielen die gewünschten Memes sofort im Chart-Dock ab
- frei wählbare Auflösung 1D / 1W / 1M; die 1D-Ansicht zeigt jede einzelne Session als Kerze
- Ereignis-Karte (Callout) im ersten Dock-Slot: zeigt Schlusskurs, Tagesveränderung, Volumen und Quellen-Links zum aktiven Kurs und wechselt automatisch, wenn man am Tape entlangscrollt — der Verweis zum Kurs läuft über den grünen Marker am Dock-Rand
- Technical-Analysis-Button mit ein-/ausblendbaren Community-Annotations (Triangle, Wedge, 483er-Resistance, Support-Zone) entlang der echten Kursmarken — im split-bereinigten Modus automatisch mit umgerechnet; seit dem Umbau zeichnet der **TA / DD DESK** stattdessen gerechnete Marken (SMA 50/200, 52-Wochen-Grenzen, Volumen-Regale, Anchored VWAPs) und stellt Community-Quellen daneben
- schwebende Preisskala, Playhead mit Kurs-Tag, Split-Marker (4:1) und Tages-Volumen unter dem Kurs
- **16 Timeline-Karten** von RC über WSB, DFV / Roaring Kitty, Robinhood, Anhörung, Superstonk, Split, Earnings und das RK-Comeback bis zu Treasury-Pivot (März 2025), 4.710 ₿ (Mai 2025), War Chest & 10-K (März 2026), eBay-Gebot (Mai 2026), Rekordquartal & Buyback (Juni 2026) und dem offenen Long Tail (Oktober 2026) — die Sprungknöpfe decken 2020 / Jan 21 / 2022 / 2024 / 2025 / 2026 ab
- Meme-Tape-Player (unten) mit echtem GIF/Video, Play/Pause und Progress, bewusst ohne Autoplay-Audio — synchron mit dem Meme-Player im Dock
- filterbarer Source Room mit GameStop IR, SEC EDGAR, Superstonk DD, GMEDD, Roaring Kitty und der House-Hearing-Seite
- durchgehend größere Beschriftung (Grundschrift 17 px, UI-Labels um zwei Stufen gewachsen, Chart-Achsen und MEME-Marker mitgezogen), responsive Layout, mobile Navigation, Keyboard-Fokus und `prefers-reduced-motion`

Die Kursdaten sind echte Tagesbars (EOD, logarithmische Skala), aber weiterhin keine Anlageberatung und keine tickgenaue Aufzeichnung — Abweichungen durch Datenquellen, Splits oder Handelsunterbrechungen sind möglich. Die Detailtexte und Links sind als redaktioneller Ausgangspunkt gedacht und sollten vor einem öffentlichen Launch noch einmal gegen Primärquellen geprüft werden.

## English UI and squeeze-era clips

The public interface, tooltips, accessibility labels and dynamic event details are in English. Meme shortcuts reveal a collapsed dock and update the selected card synchronously. Three additional January 2021 videos have publication-date anchors and original / archive-context links: placeboing’s *WE LIKE THE STOCK*, Chris Voiceman’s *DO YOU HEAR THE PEOPLE BUY*, and Flashgitz’s *300 GameStop GameStonks* (mature humor). Weekend publication dates map to the nearest available trading session; these editorial anchors do not imply a market impact.

Embedded playback depends on the original uploader and regional/provider restrictions. Use the Original or Archive / context link if an embed is unavailable. MEDIA OFF also stops clip-rail players and prevents restarting them until media is enabled.

Run `npm install` and `npm test` for the DOM regression tests. The first covers all meme shortcuts, dock visibility, selected labels and clip media-off behavior; the second pins the 2026 data layer (16 anchor moments, Bitcoin/M&A/warrant chart layers, `meme-ebay`), the number-radar rules (the $483.00 print must be tagged exactly once) and the keyboard codes (radar toggle, lore toggle, `MOON`, `TENDIEMAN`). Neither test validates external video availability or real browser layout.
