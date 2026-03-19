import React, { useEffect, useCallback, useRef } from 'react'
import { Polyline, Polygon, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { LatLngBounds } from 'leaflet'
import { useStore } from '../store/useStore'
import type { KmlFolder, KmlPlacemark } from '../types/KmlData'
import { placemarkBounds } from '../utils/kmlParser'

// ── Colour helpers ───────────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

function deriveFill(strokeColor: string): string {
    try {
        if (strokeColor.startsWith('rgba')) return strokeColor.replace(/[\d.]+\)$/, '0.18)')
        if (strokeColor.startsWith('#')) return hexToRgba(strokeColor.padEnd(7, '0'), 0.18)
    } catch { /* ignore */ }
    return 'rgba(59,130,246,0.18)'
}

// ── KML point icon ───────────────────────────────────────────────────────────
function createKmlPointIcon(color: string, isSelected: boolean): L.DivIcon {
    const size = isSelected ? 16 : 12
    const ring = isSelected
        ? `box-shadow:0 0 0 3px #fff, 0 0 14px ${color}cc;`
        : `box-shadow:0 2px 6px rgba(0,0,0,0.55);`
    return L.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:2.5px solid rgba(255,255,255,0.9);${ring}transition:all 0.15s ease;"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    })
}

// ── Collect all placemarks from a KmlFolder recursively ──────────────────────
function collectPlacemarks(folder: KmlFolder): KmlPlacemark[] {
    return [
        ...folder.placemarks,
        ...folder.children.flatMap(collectPlacemarks),
    ]
}

// ── Fit-bounds handler — lives inside MapContainer ────────────────────────────
// Watches the one-shot `pendingKmlBounds`, calls flyToBounds, then clears it.
export const KmlFitBoundsHandler: React.FC = () => {
    const map = useMap()
    const pendingKmlBounds = useStore(s => s.pendingKmlBounds)
    const clearPendingKmlBounds = useStore(s => s.clearPendingKmlBounds)

    useEffect(() => {
        if (!pendingKmlBounds) return
        const [[minLat, minLng], [maxLat, maxLng]] = pendingKmlBounds
        if (!isFinite(minLat) || !isFinite(maxLat)) {
            clearPendingKmlBounds()
            return
        }
        const bounds = new LatLngBounds([minLat, minLng], [maxLat, maxLng])
        if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 18, duration: 0.9, easeLinearity: 0.25 })
        }
        clearPendingKmlBounds()
    }, [pendingKmlBounds, map, clearPendingKmlBounds])

    return null
}

// ── Also auto-fit when a new KML layer is added ───────────────────────────────
export const KmlAutoFit: React.FC = () => {
    const map = useMap()
    const kmlLayers = useStore(s => s.kmlLayers)
    const prevCount = useRef(0)

    useEffect(() => {
        const curr = kmlLayers.filter(l => l.visible)
        if (curr.length <= prevCount.current) {
            prevCount.current = curr.length
            return
        }
        prevCount.current = curr.length
        const newest = curr[curr.length - 1]
        if (!newest?.bounds) return
        const [[minLat, minLng], [maxLat, maxLng]] = newest.bounds
        if (!isFinite(minLat)) return
        const bounds = new LatLngBounds([minLat, minLng], [maxLat, maxLng])
        if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 18, duration: 1 })
        }
    }, [kmlLayers, map])

    return null
}

// ── Single placemark renderer ─────────────────────────────────────────────────
interface KmlFeatureProps {
    pm: KmlPlacemark
    layerColor: string
    isSelected: boolean
}

const KmlFeature: React.FC<KmlFeatureProps> = React.memo(({ pm, layerColor, isSelected }) => {
    const setHoveredKmlPlacemark = useStore(s => s.setHoveredKmlPlacemark)
    const setSelectedKmlPlacemark = useStore(s => s.setSelectedKmlPlacemark)

    const strokeColor = pm.style?.lineColor ?? layerColor
    const fillColor = pm.style?.fillColor ?? deriveFill(strokeColor)
    const fillOpacity = pm.style?.fillOpacity ?? 0.18
    const weight = pm.style?.lineWidth ?? 2.5
    // Highlight values
    const hWeight = weight + 1.5
    const hFillOpacity = Math.min(fillOpacity + 0.2, 0.65)

    const handleClick = useCallback(() => {
        const b = placemarkBounds(pm)
        setSelectedKmlPlacemark(pm.id, b)
    }, [pm, setSelectedKmlPlacemark])

    const popupContent = (
        <div className="kml-popup-inner">
            <p className="popup-name" style={{ marginBottom: 4 }}>{pm.name}</p>
            {pm.description && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    {pm.description.replace(/<[^>]*>/g, '').slice(0, 200)}
                </p>
            )}
            <div className="popup-row" style={{ marginTop: 6 }}>
                <span className="popup-label">Type</span>
                <span className="popup-val">{pm.geometryType}</span>
            </div>
        </div>
    )

    // ── Point ──
    if (pm.geometryType === 'Point') {
        const c = pm.coordinates[0]?.[0]
        if (!c) return null
        const icon = createKmlPointIcon(strokeColor, isSelected)
        return (
            <Marker
                position={[c.lat, c.lng]}
                icon={icon}
                eventHandlers={{
                    click: handleClick,
                    mouseover: () => setHoveredKmlPlacemark(pm.id),
                    mouseout: () => setHoveredKmlPlacemark(null),
                }}
            >
                <Popup className="custom-popup" maxWidth={260}>{popupContent}</Popup>
            </Marker>
        )
    }

    // ── LineString / MultiGeometry lines ──
    if (pm.geometryType === 'LineString' || pm.geometryType === 'MultiGeometry') {
        return (
            <>
                {pm.coordinates.map((ring, i) => {
                    const positions = ring.map(c => [c.lat, c.lng] as [number, number])
                    if (positions.length < 2) return null
                    return (
                        <Polyline
                            key={`${pm.id}-line-${i}`}
                            positions={positions}
                            pathOptions={{
                                color: strokeColor,
                                weight: isSelected ? hWeight : weight,
                                opacity: 0.95,
                            }}
                            eventHandlers={{
                                click: handleClick,
                                mouseover: (e) => {
                                    ;(e.target as L.Polyline).setStyle({ weight: hWeight, opacity: 1 })
                                    setHoveredKmlPlacemark(pm.id)
                                },
                                mouseout: (e) => {
                                    ;(e.target as L.Polyline).setStyle({ weight, opacity: 0.95 })
                                    setHoveredKmlPlacemark(null)
                                },
                            }}
                        >
                            <Popup className="custom-popup" maxWidth={260}>{popupContent}</Popup>
                        </Polyline>
                    )
                })}
            </>
        )
    }

    // ── Polygon ──
    if (pm.geometryType === 'Polygon') {
        const rings = pm.coordinates.map(ring =>
            ring.map(c => [c.lat, c.lng] as [number, number])
        )
        if (rings[0]?.length < 3) return null
        return (
            <Polygon
                positions={rings as [number, number][][]}
                pathOptions={{
                    color: strokeColor,
                    weight: isSelected ? hWeight : weight,
                    fillColor,
                    fillOpacity: isSelected ? hFillOpacity : fillOpacity,
                    opacity: 0.95,
                }}
                eventHandlers={{
                    click: handleClick,
                    mouseover: (e) => {
                        ;(e.target as L.Polygon).setStyle({ weight: hWeight, fillOpacity: hFillOpacity })
                        setHoveredKmlPlacemark(pm.id)
                    },
                    mouseout: (e) => {
                        ;(e.target as L.Polygon).setStyle({ weight, fillOpacity })
                        setHoveredKmlPlacemark(null)
                    },
                }}
            >
                <Popup className="custom-popup" maxWidth={260}>{popupContent}</Popup>
            </Polygon>
        )
    }

    return null
})

// ── KML layer renderer (all visible layers) ───────────────────────────────────
export const KmlLayersRenderer: React.FC = () => {
    const kmlLayers = useStore(s => s.kmlLayers)
    const selectedKmlPlacemarkId = useStore(s => s.selectedKmlPlacemarkId)

    const visibleLayers = kmlLayers.filter(l => l.visible)

    return (
        <>
            <KmlAutoFit />
            {visibleLayers.map(layer => {
                const placemarks = collectPlacemarks(layer.rootFolder)
                return placemarks.map(pm => (
                    <KmlFeature
                        key={pm.id}
                        pm={pm}
                        layerColor={layer.color}
                        isSelected={pm.id === selectedKmlPlacemarkId}
                    />
                ))
            })}
        </>
    )
}

export default KmlLayersRenderer
