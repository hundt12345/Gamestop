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

`market-data.js` enthält die realen GME-Tageskerzen (Open/High/Low/Close/Volume) seit Dezember 2019, jeweils so quotiert, wie sie damals gehandelt wurden — der 4:1-Split vom Juli 2022 wird also nicht rückwirkend herausgerechnet, die Kurse bleiben mit den Ereigniskarten ($347.50 am 27. Januar 2021) konsistent.

- Aktualisieren: `node scripts/fetch-market-data.mjs` (Quelle: Yahoo-Finance-Chart-API, Tagesintervalle inkl. Split-Events).
- Automatisch: `.github/workflows/refresh-market-data.yml` läuft monatlich, bei Workflow-Änderungen und auf Knopfdruck (`workflow_dispatch`) und committet die neue Fassung.
- Fällt `market-data.js` aus, baut das Frontend eine grobe Ersatzlinie aus den dokumentierten Schlusskursen, damit der Chart nie leer bleibt.

## Im Entwurf enthalten

- Full-screen chart surface mit dem echten GME-Tape 2019 — heute; neuester Punkt startet rechts auf dem Playhead
- stufenloses Zoom: `+` / `−` / `FIT`, Strg- oder Shift-Scroll, Doppelklick zentriert das nächste Ereignis, auf Touch zwei Finger zum Pinch-Zoom
- horizontaler Drag, Mousewheel-Scroll, Range-Scrubber, ältere/neuere Navigation, Pfeiltasten und Sprünge zu 2020 / Jan 2021 / 2022 / 2024
- umschaltbare Darstellung zwischen LINE und CANDLES
- frei wählbare Auflösung 1D / 1W / 1M; die 1D-Ansicht zeigt jede einzelne Session als Kerze
- Ereignis-Karte (Callout) direkt im Chart: klappt am aktiven Kurs auf, inklusive Schlusskurs, Tagesveränderung, Volumen und Quellen-Links — und wechselt automatisch, wenn man am Tape entlangscrollt
- Technical-Analysis-Button mit ein-/ausblendbaren Community-Annotations (Triangle, Wedge, 483er-Resistance, Support-Zone) entlang der echten Kursmarken
- schwebende Preisskala, Playhead mit Kurs-Tag, Split-Marker (4:1 / as traded) und Tages-Volumen unter dem Kurs
- Timeline-Karten zu RC, WSB, DFV / Roaring Kitty, Robinhood, der Anhörung, Superstonk, Split Dividend, Earnings und dem späteren Filing-/Warrant-Long-Tail
- Text-basierter Meme-Tape-Player mit Play/Pause, Progress und bewusst ausgeschaltetem Audio
- filterbarer Source Room mit GameStop IR, SEC EDGAR, Superstonk DD, GMEDD, Roaring Kitty und der House-Hearing-Seite
- responsive Layout, mobile Navigation, Keyboard-Fokus und `prefers-reduced-motion`

Die Kursdaten sind echte Tagesbars (EOD, logarithmische Skala), aber weiterhin keine Anlageberatung und keine tickgenaue Aufzeichnung — Abweichungen durch Datenquellen, Splits oder Handelsunterbrechungen sind möglich. Die Detailtexte und Links sind als redaktioneller Ausgangspunkt gedacht und sollten vor einem öffentlichen Launch noch einmal gegen Primärquellen geprüft werden.
