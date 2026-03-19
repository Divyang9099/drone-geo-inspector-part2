import JSZip from 'jszip'
import type { KmlLayer, KmlFolder, KmlPlacemark, KmlCoordinate, KmlStyle, KmlGeometryType } from '../types/KmlData'

// ── KMZ → KML string extractor ───────────────────────────────────────────────
// KMZ is a ZIP archive. The root KML file is conventionally named doc.kml,
// but we just pick the first .kml entry we find.
export async function extractKmlFromKmz(file: File): Promise<string> {
    const zip = await JSZip.loadAsync(await file.arrayBuffer())

    // Find the first .kml file inside the archive
    const kmlEntry = Object.values(zip.files).find(
        (f) => !f.dir && f.name.toLowerCase().endsWith('.kml')
    )

    if (!kmlEntry) {
        throw new Error(`No .kml file found inside "${file.name}"`)
    }

    return kmlEntry.async('string')
}

// ── KML AABBGGRR colour → CSS rgba ──────────────────────────────────────────
function kmlColorToCss(kmlColor?: string | null): string | undefined {
    if (!kmlColor) return undefined
    const c = kmlColor.replace('#', '').trim()
    if (c.length === 8) {
        const a = parseInt(c.slice(0, 2), 16) / 255
        const b = parseInt(c.slice(2, 4), 16)
        const g = parseInt(c.slice(4, 6), 16)
        const r = parseInt(c.slice(6, 8), 16)
        return `rgba(${r},${g},${b},${a.toFixed(2)})`
    }
    if (c.length === 6) {
        const r = parseInt(c.slice(0, 2), 16)
        const g = parseInt(c.slice(2, 4), 16)
        const b = parseInt(c.slice(4, 6), 16)
        return `rgba(${r},${g},${b},1)`
    }
    return `#${c}`
}

// ── Parse coordinate string (KML: "lng,lat,alt lng,lat,alt ...") ─────────────
function parseCoords(raw: string): KmlCoordinate[] {
    const results: KmlCoordinate[] = []
    for (const token of raw.trim().split(/\s+/)) {
        const parts = token.split(',').map(Number)
        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) continue
        results.push({ lng: parts[0], lat: parts[1], alt: parts[2] })
    }
    return results
}

// ── Parse <Style> element ────────────────────────────────────────────────────
function parseStyle(styleEl: Element): KmlStyle {
    const style: KmlStyle = {}
    const lineStyle = styleEl.querySelector('LineStyle')
    if (lineStyle) {
        style.lineColor = kmlColorToCss(lineStyle.querySelector('color')?.textContent)
        const w = lineStyle.querySelector('width')?.textContent
        if (w) style.lineWidth = parseFloat(w)
    }
    const polyStyle = styleEl.querySelector('PolyStyle')
    if (polyStyle) {
        style.fillColor = kmlColorToCss(polyStyle.querySelector('color')?.textContent)
        const fill = polyStyle.querySelector('fill')?.textContent
        // fill=0 means no fill
        if (fill === '0') style.fillOpacity = 0
        else style.fillOpacity = style.fillColor ? parseFloat(style.fillColor.match(/[\d.]+\)$/)?.[0] ?? '0.35') : 0.35
    }
    const iconStyle = styleEl.querySelector('IconStyle')
    if (iconStyle) {
        style.iconColor = kmlColorToCss(iconStyle.querySelector('color')?.textContent)
        const sc = iconStyle.querySelector('scale')?.textContent
        if (sc) style.iconScale = parseFloat(sc)
    }
    return style
}

// ── Collect all styles & styleMaps from a document ──────────────────────────
function buildStyleMap(doc: Document): Map<string, KmlStyle> {
    const map = new Map<string, KmlStyle>()

    // Parse raw styles
    doc.querySelectorAll('Style[id]').forEach((el) => {
        const id = el.getAttribute('id')!
        map.set(`#${id}`, parseStyle(el))
    })

    // Resolve styleMaps → pick the 'normal' pair
    doc.querySelectorAll('StyleMap[id]').forEach((el) => {
        const id = el.getAttribute('id')!
        const pairs = Array.from(el.querySelectorAll('Pair'))
        const normal = pairs.find(p => p.querySelector('key')?.textContent === 'normal')
        if (normal) {
            const url = normal.querySelector('styleUrl')?.textContent?.trim()
            if (url && map.has(url)) {
                map.set(`#${id}`, map.get(url)!)
            }
        }
    })

    return map
}

// ── Parse geometry from a <Placemark> ─────────────────────────────────────
function parseGeometry(
    pm: Element,
    styleMap: Map<string, KmlStyle>,
    folderPath: string[],
    index: number,
): KmlPlacemark | null {
    const name = pm.querySelector(':scope > name')?.textContent?.trim() || `Feature ${index + 1}`
    const description = pm.querySelector(':scope > description')?.textContent?.trim()

    // Resolve style
    const styleUrl = pm.querySelector(':scope > styleUrl')?.textContent?.trim()
    const inlineStyle = pm.querySelector(':scope > Style')
    const style: KmlStyle | undefined = inlineStyle
        ? parseStyle(inlineStyle)
        : styleUrl
            ? styleMap.get(styleUrl)
            : undefined

    const id = `pm-${Date.now()}-${Math.random().toString(36).slice(2)}`

    // Helper: get direct-child geometry element
    const getGeomEl = (tag: string) => pm.querySelector(`:scope > ${tag}`)

    // Point
    const pointEl = getGeomEl('Point')
    if (pointEl) {
        const raw = pointEl.querySelector('coordinates')?.textContent ?? ''
        const coords = parseCoords(raw)
        if (coords.length === 0) return null
        return { id, name, description, geometryType: 'Point', coordinates: [coords], style, folderPath }
    }

    // LineString
    const lineEl = getGeomEl('LineString')
    if (lineEl) {
        const raw = lineEl.querySelector('coordinates')?.textContent ?? ''
        const coords = parseCoords(raw)
        if (coords.length < 2) return null
        return { id, name, description, geometryType: 'LineString', coordinates: [coords], style, folderPath }
    }

    // Polygon
    const polyEl = getGeomEl('Polygon')
    if (polyEl) {
        const rings: KmlCoordinate[][] = []
        const outerRaw = polyEl.querySelector('outerBoundaryIs coordinates')?.textContent ?? ''
        const outer = parseCoords(outerRaw)
        if (outer.length < 3) return null
        rings.push(outer)
        polyEl.querySelectorAll('innerBoundaryIs coordinates').forEach(el => {
            const inner = parseCoords(el.textContent ?? '')
            if (inner.length >= 3) rings.push(inner)
        })
        return { id, name, description, geometryType: 'Polygon', coordinates: rings, style, folderPath }
    }

    // MultiGeometry — collect all sub-geometries and flatten into one placemark
    const multiEl = getGeomEl('MultiGeometry')
    if (multiEl) {
        const allCoords: KmlCoordinate[][] = []
        let geomType: KmlGeometryType = 'MultiGeometry'

        multiEl.querySelectorAll('LineString').forEach(el => {
            const c = parseCoords(el.querySelector('coordinates')?.textContent ?? '')
            if (c.length >= 2) { allCoords.push(c); geomType = 'LineString' }
        })
        multiEl.querySelectorAll('Polygon').forEach(el => {
            const raw = el.querySelector('outerBoundaryIs coordinates')?.textContent ?? ''
            const c = parseCoords(raw)
            if (c.length >= 3) { allCoords.push(c); geomType = 'Polygon' }
        })
        multiEl.querySelectorAll('Point').forEach(el => {
            const c = parseCoords(el.querySelector('coordinates')?.textContent ?? '')
            if (c.length >= 1) { allCoords.push(c); geomType = 'Point' }
        })

        if (allCoords.length === 0) return null
        return { id, name, description, geometryType: geomType, coordinates: allCoords, style, folderPath }
    }

    return null
}

// ── Recursively parse <Folder> and <Document> ────────────────────────────────
let _folderCounter = 0

function parseFolder(
    el: Element,
    styleMap: Map<string, KmlStyle>,
    folderPath: string[],
): KmlFolder {
    const name = el.querySelector(':scope > name')?.textContent?.trim() || 'Untitled Folder'
    const currentPath = [...folderPath, name]
    const folderId = `folder-${Date.now()}-${++_folderCounter}`

    const placemarks: KmlPlacemark[] = []
    const children: KmlFolder[] = []

    let pmIndex = 0
    el.children && Array.from(el.children).forEach(child => {
        if (child.tagName === 'Placemark') {
            const pm = parseGeometry(child, styleMap, currentPath, pmIndex++)
            if (pm) placemarks.push(pm)
        } else if (child.tagName === 'Folder') {
            children.push(parseFolder(child, styleMap, currentPath))
        }
    })

    return { id: folderId, name, children, placemarks, isOpen: true }
}

// ── Compute bounds from all placemarks in a layer ───────────────────────────
function computeBounds(root: KmlFolder): [[number, number], [number, number]] | undefined {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    let found = false

    function walk(folder: KmlFolder) {
        folder.placemarks.forEach(pm => {
            pm.coordinates.forEach(ring => {
                ring.forEach(c => {
                    if (!isFinite(c.lat) || !isFinite(c.lng)) return
                    found = true
                    if (c.lat < minLat) minLat = c.lat
                    if (c.lat > maxLat) maxLat = c.lat
                    if (c.lng < minLng) minLng = c.lng
                    if (c.lng > maxLng) maxLng = c.lng
                })
            })
        })
        folder.children.forEach(walk)
    }
    walk(root)

    if (!found) return undefined
    return [[minLat, minLng], [maxLat, maxLng]]
}

// ── Main export ──────────────────────────────────────────────────────────────
export function parseKmlFile(
    kmlContent: string,
    fileName: string,
    layerColor: string,
): KmlLayer {
    _folderCounter = 0
    const parser = new DOMParser()
    const doc = parser.parseFromString(kmlContent, 'application/xml')

    const parseError = doc.querySelector('parsererror')
    if (parseError) {
        throw new Error(`KML parse error: ${parseError.textContent}`)
    }

    const styleMap = buildStyleMap(doc)

    // KML may have multiple top-level Document or Folder
    const topEl = doc.querySelector('kml > Document') ?? doc.querySelector('kml > Folder') ?? doc.documentElement

    const rootName = topEl.querySelector(':scope > name')?.textContent?.trim() || fileName.replace(/\.(kml|kmz)$/i, '')

    // Build a synthetic root folder that wraps everything
    const rootFolder: KmlFolder = {
        id: `root-${Date.now()}`,
        name: rootName,
        children: [],
        placemarks: [],
        isOpen: true,
    }

    // Direct placemarks inside the Document/top el
    let pmIdx = 0
    Array.from(topEl.children).forEach(child => {
        if (child.tagName === 'Placemark') {
            const pm = parseGeometry(child, styleMap, [rootName], pmIdx++)
            if (pm) rootFolder.placemarks.push(pm)
        } else if (child.tagName === 'Folder') {
            rootFolder.children.push(parseFolder(child, styleMap, [rootName]))
        }
    })

    const bounds = computeBounds(rootFolder)

    return {
        id: `kml-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fileName,
        color: layerColor,
        visible: true,
        rootFolder,
        uploadedAt: new Date().toISOString(),
        bounds,
    }
}

// ── Public helpers for click/hover bounds ─────────────────────────────────────

type LatLngBounds2 = [[number, number], [number, number]]

/** Compute bounding box of a single placemark's coordinates. */
export function placemarkBounds(pm: KmlPlacemark): LatLngBounds2 | null {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    for (const ring of pm.coordinates) {
        for (const c of ring) {
            if (!isFinite(c.lat) || !isFinite(c.lng)) continue
            if (c.lat < minLat) minLat = c.lat
            if (c.lat > maxLat) maxLat = c.lat
            if (c.lng < minLng) minLng = c.lng
            if (c.lng > maxLng) maxLng = c.lng
        }
    }
    if (!isFinite(minLat)) return null
    // Points: add small padding so map doesn't zoom in too aggressively
    if (pm.geometryType === 'Point') {
        const pad = 0.006
        return [[minLat - pad, minLng - pad], [maxLat + pad, maxLng + pad]]
    }
    return [[minLat, minLng], [maxLat, maxLng]]
}

/** Compute combined bounding box of all placemarks in a folder (recursive). */
export function folderBounds(folder: KmlFolder): LatLngBounds2 | null {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    function walk(f: KmlFolder) {
        for (const pm of f.placemarks) {
            const b = placemarkBounds(pm)
            if (!b) continue
            if (b[0][0] < minLat) minLat = b[0][0]
            if (b[1][0] > maxLat) maxLat = b[1][0]
            if (b[0][1] < minLng) minLng = b[0][1]
            if (b[1][1] > maxLng) maxLng = b[1][1]
        }
        for (const child of f.children) walk(child)
    }
    walk(folder)
    if (!isFinite(minLat)) return null
    return [[minLat, minLng], [maxLat, maxLng]]
}

