# tide — Interaktive Gezeiten-Website (BSH)

Diese Repository enthält eine einfache, interaktive Website, die Daten vom BSH WaterLevelForecast API liest und darstellt.

Installation/Deployment:
- Die Seite ist eine statische Website. Sie kann direkt in den Branch `gh-pages` gepusht und über GitHub Pages veröffentlicht werden.

Was sie macht:
- Lädt Stationsliste vom BSH-API
- Wählt automatisch eine Station (versucht Geolocation, sonst die erste Station)
- Zeigt die Gezeitenkurve, Hoch-/Niedrigwasser-Ereignisse und Rohdaten an

Hinweis:
- Wenn das BSH-API CORS verhindert, ist ein kleiner Proxy nötig. In vielen Fällen funktioniert direkter Zugriff jedoch.
- Alle Texte sind auf Deutsch.

