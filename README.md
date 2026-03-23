# निरीक्षकः — Drone Geo Inspector Part 2
https://drone-geo-inspector-part2.vercel.app/

> A professional, browser-based tool for visualizing drone survey images on an interactive map. Extracts GPS metadata from EXIF data, renders clustered markers, supports KML overlays, and features a live High-Definition Power Infrastructure map powered by OpenInfraMap vector tiles.

---

## 📌 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Image Type Detection](#image-type-detection)
- [Map Layers](#map-layers)
- [Infrastructure Map](#infrastructure-map)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Scripts](#scripts)

---

## Overview

**निरीक्षकः** is a React + TypeScript web application that lets you upload folders of drone-captured JPEG images and instantly see every geotagged photo plotted on an interactive map. It works entirely in the browser — no server, no upload, no data leaves your machine.

The app parses **EXIF GPS metadata** (latitude, longitude, altitude, and timestamp) directly from your `.jpg` / `.jpeg` files using the `exifr` library, then renders colour-coded markers on a Leaflet map. You can browse images by folder in a sidebar, hover over markers to see a quick-look card, click to fly to the location, and open a full-screen lightbox with zoom and pan.

---

## ✨ Features

### Core

- **Folder upload** — click **+ Add Folder** to select an entire directory of drone JPEGs; the browser reads them directly (no server needed).
- **Real-time EXIF extraction** — GPS coordinates, altitude (`GPSAltitude`), capture time (`DateTimeOriginal` / `CreateDate`) are parsed per image with a live progress counter.
- **Multi-folder sessions** — add as many folders as you like; each gets a unique auto-assigned colour from a 10-colour palette.
- **KML / KMZ import** — import KML or KMZ files (including Google Earth exports); placemarks and paths are rendered as overlay layers.
- **Skipped-image reporting** — images with no GPS metadata are counted and shown as a "Skipped" warning chip.

### Map

- **Interactive Leaflet map** — centre defaults to India (lat 20, lng 78) at zoom 5; auto-fits to loaded images.
- **Smart marker clustering** — powered by `react-leaflet-cluster`; clusters collapse at zoom < 18 and use a colour-coded pie/conic-gradient icon when images from multiple folders are grouped.
- **Same-location grouping** — images within ~1 metre (0.000009°) of each other are rendered as a single marker with a count badge.
- **Hover card** — hovering a marker shows a floating card with thumbnail, coordinates, altitude, and type. When multiple images share a location, the card shows tab controls to cycle through each one.
- **Marker selection** — clicking a marker (or a sidebar row) `flyTo`-animates the map to that point and highlights the marker with a glowing pulse ring.
- **Flight path overlay** — toggle **🗺 Path** to draw a dashed red polyline connecting all points in chronological order. Total distance in km is shown in the sidebar footer and top bar.
- **Layer switcher** — five tile providers including a dedicated HD Infrastructure view.
- **Folder click → map zoom** — clicking a folder name in the File Manager triggers a smooth `flyToBounds` animation with a bright cyan pop highlight on all matching markers.

### File Manager (Sidebar)

- Lists all loaded folders as collapsible blocks with a sticky colour-dot header and image count.
- Clicking an image row flies the map to that marker and opens the hover card at the pixel position after the `flyTo` animation ends.
- Auto-expands the folder containing the currently selected or hovered image.
- Shows the specific sub-folder that contains the selected image — useful for deep folder structures.
- Fixed bottom stats bar shows total images, folder count, KML count, and flight path distance.

### Lightbox

- Full-screen image viewer opened from the hover card.
- **Zoom**: mouse wheel, `+`/`-` keys, or floating `−/+` buttons (1× – 8×, step 0.35×).
- **Pan**: click-and-drag when zoomed in.
- **Navigation**: `←`/`→` arrow keys or on-screen `‹`/`›` buttons cycle through the current filtered image list.
- **Close**: `Esc` key or click overlay / ✕ button.

### Filtering

- **All / 🌡 Thermal / 📷 Visual** filter buttons in the top bar filter map markers, sidebar list, flight path, and lightbox navigation simultaneously.

---

## 🛠 Tech Stack

| Layer | Library / Tool | Version |
|---|---|---|
| Framework | React | ^19.2.0 |
| Language | TypeScript | ~5.9.3 |
| Build tool | Vite | ^7.3.1 |
| Map | react-leaflet + leaflet | ^5.0.0 / ^1.9.4 |
| Clustering | react-leaflet-cluster | ^4.0.0 |
| Vector tiles | MapLibre GL JS + @maplibre/maplibre-gl-leaflet | ^5.x |
| EXIF parsing | exifr | ^7.1.3 |
| State management | Zustand | ^5.0.11 |
| Styling | Vanilla CSS + TailwindCSS v4 | ^4.2.1 |
| Font | Inter (Google Fonts) | 300–700 |
| Linting | ESLint 9 + typescript-eslint | ^9.39.1 |

---

## 📁 Project Structure

```
map extractor part 2/
├── index.html                    # App shell – title, favicon, meta, Google Fonts
├── vite.config.ts                # Vite config with React + Tailwind plugins
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx                  # React entry point
    ├── App.tsx                   # Root layout (TopBar | FileManager | MapView | HoverCard | Lightbox)
    ├── index.css                 # All component styles (~52 KB)
    ├── assets/
    │   └── favicon.png           # App icon / brand logo
    ├── components/
    │   ├── TopBar.tsx            # Header: brand, + Add Folder, filter pills, stats chips
    │   ├── FileManager.tsx       # Left sidebar: folder blocks, image rows, KML layers, stats bar
    │   ├── MapView.tsx           # Leaflet map, markers, clustering, layer toggle, polyline, infra overlay
    │   ├── MapLibreLayer.tsx     # MapLibre GL Leaflet integration for vector infrastructure tiles
    │   ├── HoverCard.tsx         # Floating card on marker hover / sidebar click
    │   ├── ImageLightbox.tsx     # Full-screen lightbox with zoom, pan, and navigation
    │   └── KmlRenderer.tsx       # KML layer rendering + fit-bounds handler
    ├── store/
    │   └── useStore.ts           # Zustand global store (all state + actions)
    ├── types/
    │   ├── ImageData.ts          # ImageData interface
    │   ├── FolderData.ts         # FolderData interface
    │   └── KmlData.ts            # KmlLayer, KmlFolder, KmlPlacemark interfaces
    └── utils/
        ├── exifExtractor.ts      # File → EXIF GPS/altitude/timestamp extraction
        ├── kmlParser.ts          # KML/KMZ parsing → KmlLayer structure
        ├── geoUtils.ts           # sortByTimestamp, filterByType, getImageBounds, formatCoords
        └── distance.ts           # haversineDistance, calculateTotalDistance
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Divyang9099/drone-geo-inspector-part2.git
cd drone-geo-inspector-part2

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open your browser at **http://localhost:5173** (default Vite port).

### Build for Production

```bash
npm run build      # TypeScript compile + Vite bundle → dist/
npm run preview    # Serve the dist/ folder locally
```

---

## ⚙️ How It Works

1. **User clicks "+ Add Folder"** → browser file picker opens with `webkitdirectory` attribute.
2. **TopBar** derives the folder name, assigns a colour from `FOLDER_COLORS`, and calls `processFolder()`.
3. **`processFolder` (exifExtractor.ts)**:
   - Filters to `.jpg`/`.jpeg` only.
   - Calls `exifr.gps()` for coordinates and `exifr.parse()` for altitude and timestamps.
   - Images without GPS data are counted as `skipped`.
   - Creates an `objectUrl` (via `URL.createObjectURL`) for each valid image.
4. **Zustand store** (`addFolder`) merges the new folder, re-sorts all images by timestamp, re-applies the active filter, and recomputes flight distance using the Haversine formula.
5. **MapView** re-renders with updated `filteredImages`, grouping same-location images (`buildLocationGroups`, ~1 m threshold) and rendering one marker per unique location.
6. **`react-leaflet-cluster`** clusters markers at lower zoom levels, unclusters at zoom ≥ 18.

---

## 🔍 Image Type Detection

Automatically inferred from the **filename suffix**:

| Filename suffix | Detected type |
|---|---|
| `*_T.jpg` | `thermal` — displayed with 🌡 orange colour |
| `*_V.jpg` | `visual` — displayed with 📷 folder colour |
| anything else | `unknown` — treated as visual |

---

## 🗺 Map Layers

Switch map background using the toggle bar in the top-left corner of the map:

| Button | Provider | Notes |
|---|---|---|
| 🛰 Satellite | Google Satellite | Max zoom 21 |
| 🌐 Hybrid | Google Hybrid | Max zoom 21 |
| 🗺 Esri | Esri World Imagery | Max zoom 19 |
| 🏙️ Street | OpenStreetMap | Max zoom 19 |
| ⚡ Infra | OSM + OpenInfraMap Vector | HD power grid overlay |

---

## ⚡ Infrastructure Map

When **⚡ Infra** is selected, the map renders a High-Definition power infrastructure overlay from **[OpenInfraMap](https://openinframap.org)** vector tiles on top of an OpenStreetMap base layer.

### What is shown (Power only):

| Feature | Color | Appears at zoom |
|---|---|---|
| ≥500kV transmission lines | Deep red | 5+ |
| 400kV lines | Bright red / pink | 5+ |
| 220–275kV lines | Purple / violet | 5+ |
| 110–150kV lines | Dark orange | 6+ |
| <60kV / unknown lines | Grey | 8+ |
| Transmission towers (pylons) | Black dots | 11+ |
| Substations | Grey circles | 7+ |
| Voltage labels ("400 kV") | Text along lines | 12+ |

The vector data comes directly from **[openinframap.org/tiles](https://openinframap.org/)** (OpenStreetMap-derived), rendered using **MapLibre GL JS** for crisp, HD, zoom-independent display — no pixelation ever.

---

## ⌨️ Keyboard Shortcuts

Active while the **lightbox** is open:

| Key | Action |
|---|---|
| `←` | Previous image |
| `→` | Next image |
| `+` or `=` | Zoom in |
| `-` | Zoom out |
| `0` | Reset zoom & pan |
| `Esc` | Close lightbox |

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | TypeScript check + production bundle |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint across `src/` |

---

## 📄 License

This project is private. All rights reserved.
