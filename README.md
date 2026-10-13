# GameStop / Event Tape

Ein visueller Prototyp für eine scrollbare, quellenverlinkte Chronik der GameStop-Ereignisse ab 2020. Der Chart ist die Leitachse; beim Scrollen wird der aktive Punkt synchron mit der Story-Karte und dem Sticky-Chart aktualisiert.

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

## Im Entwurf enthalten

- sticky, interaktiver Chart mit elf Story-Ankern von 2020 bis 2025 →
- Scroll-Synchronisation, Punkt-Navigation und Sprünge zu 2020 / Jan 2021 / 2022 / 2024
- Timeline-Karten zu RC, WSB, DFV / Roaring Kitty, Robinhood, der Anhörung, Superstonk, Split Dividend, Earnings und dem späteren Filing-/Warrant-Long-Tail
- Text-basierter Meme-Tape-Player mit Play/Pause, Progress und bewusst ausgeschaltetem Audio
- filterbarer Source Room mit GameStop IR, SEC EDGAR, Superstonk DD, GMEDD, Roaring Kitty und der House-Hearing-Seite
- responsive Layout, mobile Navigation, Keyboard-Fokus und `prefers-reduced-motion`

Die Kurslinie ist im aktuellen Draft ausdrücklich eine visuelle Orientierung mit ausgewählten, logarithmisch dargestellten Momenten — keine vollständige Historie und keine Anlageberatung. Die Detailtexte und Links sind als redaktioneller Ausgangspunkt gedacht und sollten vor einem öffentlichen Launch noch einmal gegen Primärquellen geprüft werden.
