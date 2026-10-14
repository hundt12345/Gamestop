# GameStop / Event Tape

Ein visueller Prototyp für eine quellenverlinkte Chronik der GameStop-Ereignisse ab 2020. Der Hauptscreen ist ein horizontaler, Webull-inspirierter Chart: der neueste Punkt liegt rechts, per Drag/Scroll geht es nach links in die Vergangenheit — und der Chart lässt sich stufenlos bis auf einzelne Handelstage hineinzoomen. Jedes Ereignis klappt als Karte direkt am Kurs auf.

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

- **Standardansicht ist split-bereinigt:** der 4:1-Split vom 22. Juli 2022 wird rückwirkend herausgerechnet (alle Kurse davor durch 4 geteilt, Volumen × 4), damit die Kurve über den Split hinweg vergleichbar bleibt. Der Knopf `SPLIT-ADJ ↔ AS TRADED` oben im Chart schaltet um — Event-Karten, Kurs-Inspektor, TA-Layer und Meme-Preise folgen mit.
- Aktualisieren: `node scripts/fetch-market-data.mjs` (Quelle: Yahoo-Finance-Chart-API, Tagesintervalle inkl. Split-Events).
- Automatisch: `.github/workflows/refresh-market-data.yml` läuft monatlich, bei Workflow-Änderungen und auf Knopfdruck (`workflow_dispatch`) und committet die neue Fassung.
- Fällt `market-data.js` aus, baut das Frontend eine grobe Ersatzlinie aus den dokumentierten Schlusskursen, damit der Chart nie leer bleibt.

## Im Entwurf enthalten

- Full-screen chart surface mit dem echten GME-Tape 2019 — heute; neuester Punkt startet rechts auf dem Playhead
- **DOCK statt Overlay:** Ereignis-Karte, Meme-Player und Cursor-OHLC liegen in einem eigenen Bereich **unterhalb** der Kursfläche — keine Einblendung liegt mehr über dem Chart. Zwei Marker am oberen Rand des Docks (grün = Ereignis, blau = Meme) zeigen exakt, zu welchem Kurs die Karte gehört; `HIDE DOCK` klappt den Bereich weg, dann nutzt der Chart wieder die volle Höhe.
- **Klick in den Chart zeigt den Kurs:** ein Klick an eine beliebige Stelle setzt ein Crosshair auf den nächstgelegenen Handelstag und legt Datum, Open/High/Low/Close, Volumen und Tagesänderung in den dritten Dock-Slot — plus den exakten Kurs an der geklickten Höhe als Flagge an der Preisskala (Esc schließt)
- **Split-bereinigte Kurse als Standard** mit Umschalter auf `AS TRADED` (siehe oben)
- stufenloses Zoom: `+` / `−` / `FIT`, Strg- oder Shift-Scroll, Doppelklick zentriert das nächste Ereignis, auf Touch zwei Finger zum Pinch-Zoom
- horizontaler Drag, Mousewheel-Scroll, Range-Scrubber, ältere/neuere Navigation, Pfeiltasten und Sprünge zu 2020 / Jan 2021 / 2022 / 2024
- umschaltbare Darstellung zwischen LINE und CANDLES
- **20 Memes an echten Handelstagen:** blaue `M1 ▶` … `M20 ▶` Marker hängen am Tape (RC-Einstieg, Letter, Board-Sitz, DFV, YOLO, To the Moon, Diamond Hands, Squeeze, Buy-Button, Top of Tape, Anhörung, Dumb Money, Hold the Line, AMC, Superstonk, AMC-Stake, Split, erster Gewinn, Roaring-Kitty-Comeback, Livestream 2024). Klick spielt den Moment im Dock ab mit Play/Pause, Fortschritt und Loop — der MEMES-Knopf blendet die Marker ein/aus, und die Auswahl im Meme-Tape unten springt mit ins Chart
- **echte GIF- und Video-Einbettungen statt Platzhalter:** die GIFs laufen direkt von Giphy (u. a. „I am not a cat“ aus der Anhörung, Paul Dano aus *Dumb Money*, „Buy Now“ als Buy-Button, Hold-the-Line, Jim Cramer), die Videos über den `youtube-nocookie`-Player (beide Kanäle der Anhörung vom 18.02.2021, Roaring Kittys Livestream vom 07.06.2024 und sein „Cheers Everyone!“ vom 16.04.2021). Der Video-Player startet erst auf Klick, die GIFs auf der Wand erst beim Scrollen in den Bereich — und jede Einbettung verlinkt auf ihren Original-Post
- `MEDIA ON/OFF` in der Subbar schaltet alle Einbettungen ab: der Player bleibt dann rein textlich und löst keinen einzigen externen Request aus
- Meme-Wand mit allen 20 Momenten plus Clip-Rail mit den vier Originalaufnahmen im Meme-Tape — beides bewusst weit weg vom Chart
- frei wählbare Auflösung 1D / 1W / 1M; die 1D-Ansicht zeigt jede einzelne Session als Kerze
- Ereignis-Karte (Callout) im ersten Dock-Slot: zeigt Schlusskurs, Tagesveränderung, Volumen und Quellen-Links zum aktiven Kurs und wechselt automatisch, wenn man am Tape entlangscrollt — der Verweis zum Kurs läuft über den grünen Marker am Dock-Rand
- Technical-Analysis-Button mit ein-/ausblendbaren Community-Annotations (Triangle, Wedge, 483er-Resistance, Support-Zone) entlang der echten Kursmarken — im split-bereinigten Modus automatisch mit umgerechnet
- schwebende Preisskala, Playhead mit Kurs-Tag, Split-Marker (4:1) und Tages-Volumen unter dem Kurs
- Timeline-Karten zu RC, WSB, DFV / Roaring Kitty, Robinhood, der Anhörung, Superstonk, Split Dividend, Earnings und dem späteren Filing-/Warrant-Long-Tail
- Meme-Tape-Player (unten) mit echtem GIF/Video, Play/Pause und Progress, bewusst ohne Autoplay-Audio — synchron mit dem Meme-Player im Dock
- filterbarer Source Room mit GameStop IR, SEC EDGAR, Superstonk DD, GMEDD, Roaring Kitty und der House-Hearing-Seite
- durchgehend größere Beschriftung (Grundschrift 17 px, UI-Labels um zwei Stufen gewachsen, Chart-Achsen und MEME-Marker mitgezogen), responsive Layout, mobile Navigation, Keyboard-Fokus und `prefers-reduced-motion`

Die Kursdaten sind echte Tagesbars (EOD, logarithmische Skala), aber weiterhin keine Anlageberatung und keine tickgenaue Aufzeichnung — Abweichungen durch Datenquellen, Splits oder Handelsunterbrechungen sind möglich. Die Detailtexte und Links sind als redaktioneller Ausgangspunkt gedacht und sollten vor einem öffentlichen Launch noch einmal gegen Primärquellen geprüft werden.
