# 🌊 Tidenkalender

Interaktiver Gezeitenkalender für die deutsche Nordsee- und Ostseeküste.
Zeigt Hoch- und Niedrigwasserzeiten in **Ortszeit und UTC**, den Vorhersagewert,
die daraus abgeleitete **Tidenart** (Springtide / Nipptide / Mitteltide) sowie
die passende **Mondphase als Emoji** – pro Pegel filterbar nach Region und Bundesland.

Reine Client-seitige Anwendung (HTML/CSS/JavaScript, kein Build-Prozess, kein Backend) –
ideal für GitHub Pages.

## Datenquelle

Alle Wasserstands- und Gezeitendaten stammen live von der offiziellen API des
**Bundesamts für Seeschifffahrt und Hydrographie (BSH)**:

- API: `https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast`
- Lizenz: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.de)
- Abdeckung: **ausschließlich deutsche Pegel** an Nord- und Ostsee (rund 130+ Stationen).
  Andere Länder sind über diese kostenfreie, registrierungsfreie API nicht verfügbar –
  die Länderauswahl in der Oberfläche ist bewusst so aufgebaut, dass später weitere
  Datenquellen für andere Länder ergänzt werden können.

Mondphasen werden rein astronomisch im Browser berechnet (kein externer Dienst nötig).
Die Einordnung als Spring-/Nipp-/Mitteltide ist eine Näherung anhand des Abstands zum
nächsten Neu-/Vollmond bzw. Halbmond und **keine amtliche BSH-Angabe**.

## Lokal testen

Da die Seite `fetch()` gegen eine externe API nutzt, muss sie über einen lokalen
Webserver (nicht per `file://`) geöffnet werden:

```bash
cd tiden-website
python3 -m http.server 8080
# dann im Browser: http://localhost:8080
```

## Deployment auf GitHub Pages

1. Neues (oder bestehendes) GitHub-Repository anlegen.
2. Den gesamten Inhalt dieses Ordners (`index.html`, `css/`, `js/`, `README.md`)
   in das Repository pushen, z. B.:

   ```bash
   git init
   git add .
   git commit -m "Tidenkalender: initiale Version"
   git branch -M main
   git remote add origin https://github.com/<dein-user>/<dein-repo>.git
   git push -u origin main
   ```

3. Im Repository unter **Settings → Pages**:
   - „Source“ auf **Deploy from a branch** stellen
   - Branch **main**, Ordner **/ (root)** auswählen, speichern.
4. Nach ein bis zwei Minuten ist die Seite unter
   `https://<dein-user>.github.io/<dein-repo>/` erreichbar.

Kein Build-Schritt, keine Abhängigkeiten, kein API-Key nötig – die Seite ruft die
BSH-API direkt aus dem Browser der Besucher:innen auf.

## Struktur

```
tiden-website/
├── index.html      # Struktur & Filter-UI
├── css/style.css   # Design (Beige/Grün, angelehnt an Scalable Capital)
├── js/app.js       # API-Anbindung, Filter, Mondphasen, Tabellen-/Kurvenrendering
└── README.md
```

## Bekannte Einschränkungen

- Die BSH-API liefert **nur deutsche Pegel** – daher aktuell nur ein Land wählbar.
- Beim ersten Laden wird die komplette BSH-Kollektion (alle Pegel inkl. Kurvendaten)
  einmalig geladen; das kann je nach Verbindung ein paar Sekunden dauern.
- Die Farbwerte orientieren sich optisch an Scalable Capital, sind aber keine
  exakt lizenzierten Markenfarben.
