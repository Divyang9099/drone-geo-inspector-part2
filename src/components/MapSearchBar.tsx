import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { loadGoogleMaps } from '../utils/googleMapsLoader'

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined

// ── Unified suggestion type ───────────────────────────────────────────────────
interface Suggestion {
    id: string
    placeId?: string          // Google place_id — coordinates resolved on selection
    lat?: number              // pre-filled for Nominatim/Photon results
    lon?: number
    primaryName: string
    context: string
    types: string[]           // e.g. ['restaurant','establishment'] from Google
    source: 'google' | 'osm'
}

// ── Coordinate shortcut ───────────────────────────────────────────────────────
function parseCoordinates(input: string): { lat: number; lon: number } | null {
    const plain = input.trim().replace(/[°NnSsEeWw]/g, '').replace(/\s+/g, ' ')
    const parts = plain.split(/[,\s]+/).filter(Boolean)
    if (parts.length === 2) {
        const lat = parseFloat(parts[0])
        const lon = parseFloat(parts[1])
        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)
            return { lat, lon }
    }
    return null
}

// ── Google Places Autocomplete ────────────────────────────────────────────────
async function googleAutocomplete(query: string, signal: AbortSignal): Promise<Suggestion[]> {
    if (!GOOGLE_KEY) return []
    await loadGoogleMaps(GOOGLE_KEY)
    if (signal.aborted) return []

    const svc = new google.maps.places.AutocompleteService()
    return new Promise(resolve => {
        svc.getPlacePredictions(
            { input: query },
            (preds: google.maps.places.AutocompletePrediction[] | null,
             status: google.maps.places.PlacesServiceStatus) => {
                if (
                    status !== google.maps.places.PlacesServiceStatus.OK ||
                    !preds
                ) { resolve([]); return }

                resolve(preds.map((p, i) => ({
                    id: `g-${p.place_id}-${i}`,
                    placeId: p.place_id,
                    primaryName: p.structured_formatting.main_text,
                    context: p.structured_formatting.secondary_text || '',
                    types: p.types || [],
                    source: 'google' as const,
                })))
            }
        )
    })
}

// ── Resolve Google place_id → lat/lon via Geocoder ───────────────────────────
async function resolveGoogleLatLon(
    placeId: string
): Promise<{ lat: number; lon: number; viewport?: google.maps.LatLngBounds } | null> {
    if (!GOOGLE_KEY) return null
    await loadGoogleMaps(GOOGLE_KEY)

    const geo = new google.maps.Geocoder()
    return new Promise(resolve => {
        geo.geocode({ placeId }, (results, status) => {
            if (status !== 'OK' || !results?.length) { resolve(null); return }
            const loc = results[0].geometry.location
            resolve({
                lat: loc.lat(),
                lon: loc.lng(),
                viewport: results[0].geometry.viewport,
            })
        })
    })
}

// ── OSM Photon fallback (no API key, global) ──────────────────────────────────
async function photonFallback(query: string, signal: AbortSignal): Promise<Suggestion[]> {
    try {
        const url = new URL('https://photon.komoot.io/api/')
        url.searchParams.set('q', query)
        url.searchParams.set('limit', '5')
        url.searchParams.set('lang', 'en')

        const res = await fetch(url.toString(), { signal })
        if (!res.ok) return []
        const data = await res.json()

        return (data.features || []).map((f: any, i: number) => {
            const p = f.properties || {}
            const [lon, lat] = f.geometry.coordinates as [number, number]
            const primary = p.name || p.street || p.city || 'Unknown'
            const ctxParts = [p.street, p.city || p.town || p.village, p.state, p.country]
                .filter(Boolean).filter(b => b !== primary)
            return {
                id: `osm-${p.osm_id || i}`,
                lat, lon,
                primaryName: primary,
                context: [...new Set(ctxParts)].slice(0, 3).join(', '),
                types: [p.osm_key || 'place', p.osm_value || 'place'],
                source: 'osm' as const,
            }
        })
    } catch { return [] }
}

// ── Icon: pick from Google types array ───────────────────────────────────────
function getIcon(types: string[]): string {
    const t = new Set(types)
    if (t.has('restaurant') || t.has('food') || t.has('cafe') || t.has('bakery')) return '🍽️'
    if (t.has('bar') || t.has('night_club')) return '🍻'
    if (t.has('hospital') || t.has('doctor') || t.has('pharmacy') || t.has('dentist')) return '🏥'
    if (t.has('school') || t.has('university') || t.has('library')) return '🎓'
    if (t.has('bank') || t.has('atm') || t.has('finance')) return '🏦'
    if (t.has('gas_station')) return '⛽'
    if (t.has('parking')) return '🅿️'
    if (t.has('store') || t.has('shop') || t.has('shopping_mall') || t.has('supermarket')) return '🛍️'
    if (t.has('clothing_store') || t.has('shoe_store')) return '👗'
    if (t.has('electronics_store')) return '📱'
    if (t.has('hotel') || t.has('lodging')) return '🏨'
    if (t.has('tourist_attraction') || t.has('museum') || t.has('art_gallery')) return '🏛️'
    if (t.has('amusement_park') || t.has('zoo') || t.has('aquarium')) return '🎡'
    if (t.has('place_of_worship') || t.has('church') || t.has('mosque') || t.has('hindu_temple')) return '🕌'
    if (t.has('police')) return '🚨'
    if (t.has('post_office')) return '📮'
    if (t.has('airport')) return '✈️'
    if (t.has('bus_station') || t.has('transit_station') || t.has('train_station') || t.has('subway_station')) return '🚉'
    if (t.has('gym') || t.has('stadium') || t.has('sports_complex')) return '🏟️'
    if (t.has('park') || t.has('natural_feature')) return '🌳'
    if (t.has('beach')) return '🏖️'
    if (t.has('locality') || t.has('sublocality') || t.has('neighborhood')) return '🏘️'
    if (t.has('administrative_area_level_1')) return '🗺️'
    if (t.has('administrative_area_level_2') || t.has('administrative_area_level_3')) return '🗺️'
    if (t.has('country') || t.has('political')) return '🌏'
    if (t.has('route') || t.has('street_address')) return '🛣️'
    if (t.has('industrial') || t.has('factory') || t.has('establishment')) return '🏭'
    if (t.has('premise') || t.has('subpremise') || t.has('point_of_interest')) return '📍'
    return '📍'
}

// ── Zoom level from Google place types ────────────────────────────────────────
function getZoomFromTypes(types: string[]): number {
    const t = new Set(types)
    if (t.has('country')) return 5
    if (t.has('administrative_area_level_1')) return 7
    if (t.has('administrative_area_level_2')) return 9
    if (t.has('administrative_area_level_3') || t.has('locality')) return 12
    if (t.has('sublocality') || t.has('sublocality_level_1') || t.has('neighborhood')) return 14
    if (t.has('route') || t.has('street_address')) return 15
    if (t.has('postal_code')) return 13
    return 17  // establishment / POI default
}

// ── Category badge ────────────────────────────────────────────────────────────
function getCatLabel(types: string[], source: 'google' | 'osm'): string {
    if (source === 'osm') return types[1]?.replace(/_/g, ' ') || types[0]?.replace(/_/g, ' ') || 'place'
    // Google: skip generic tags, pick first specific one
    const skip = new Set(['establishment', 'point_of_interest', 'political', 'geocode'])
    const specific = types.find(t => !skip.has(t))
    return (specific || types[0] || 'place').replace(/_/g, ' ')
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const cache: Record<string, Suggestion[]> = {}
const DEBOUNCE_MS = 250

// ── Component ─────────────────────────────────────────────────────────────────
const MapSearchBar: React.FC = () => {
    const [query, setQuery]             = useState('')
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [isOpen, setIsOpen]           = useState(false)
    const [loading, setLoading]         = useState(false)
    const [activeIdx, setActiveIdx]     = useState(-1)
    const [coordResult, setCoordResult] = useState<{ lat: number; lon: number } | null>(null)
    const [error, setError]             = useState<string | null>(null)
    const [dropPos, setDropPos]         = useState<{ top: number; left: number; width: number } | null>(null)

    const wrapperRef = useRef<HTMLDivElement>(null)
    const dropRef    = useRef<HTMLDivElement>(null)
    const inputRef   = useRef<HTMLInputElement>(null)
    const abortRef   = useRef<AbortController | null>(null)
    const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

    const { mapFlyTo, setSearchPin } = useStore()

    const computeDropPos = useCallback(() => {
        if (!wrapperRef.current) return
        const r = wrapperRef.current.getBoundingClientRect()
        setDropPos({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 460) })
    }, [])

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        abortRef.current?.abort()
    }, [])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target as Node
            if (!wrapperRef.current?.contains(t) && !dropRef.current?.contains(t)) {
                setIsOpen(false); setActiveIdx(-1)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    useEffect(() => {
        if (!isOpen) return
        computeDropPos()
        window.addEventListener('resize', computeDropPos)
        window.addEventListener('scroll', computeDropPos, true)
        return () => {
            window.removeEventListener('resize', computeDropPos)
            window.removeEventListener('scroll', computeDropPos, true)
        }
    }, [isOpen, computeDropPos])

    // Pre-warm the Google Maps API on first mount so it's ready when user types
    useEffect(() => {
        if (GOOGLE_KEY) loadGoogleMaps(GOOGLE_KEY).catch(() => { /* ignore */ })
    }, [])

    // ── Fetch suggestions ─────────────────────────────────────────────────────
    const fetchSuggestions = useCallback(async (text: string) => {
        const t = text.trim()
        if (t.length < 2) { setSuggestions([]); setIsOpen(false); return }

        const coords = parseCoordinates(t)
        if (coords) {
            setCoordResult(coords); setSuggestions([])
            setLoading(false); setIsOpen(true); computeDropPos(); return
        }
        setCoordResult(null)

        if (cache[t]) {
            setSuggestions(cache[t]); setIsOpen(true); computeDropPos()
            setLoading(false); return
        }

        abortRef.current?.abort()
        abortRef.current = new AbortController()
        const { signal } = abortRef.current

        setLoading(true); setError(null)

        try {
            let results: Suggestion[]

            if (GOOGLE_KEY) {
                // Google Places — comprehensive, includes all businesses/POIs
                results = await googleAutocomplete(t, signal)

                // If Google returns nothing, silently try OSM
                if (results.length === 0 && !signal.aborted) {
                    results = await photonFallback(t, signal)
                }
            } else {
                // No API key — fall back to Photon (OSM)
                results = await photonFallback(t, signal)
            }

            if (signal.aborted) return

            cache[t] = results
            setSuggestions(results); setIsOpen(true); computeDropPos()
        } catch (e: unknown) {
            if ((e as Error).name !== 'AbortError') {
                setError('Search failed. Check your connection.')
                setIsOpen(true); computeDropPos()
            }
        } finally {
            setLoading(false)
        }
    }, [computeDropPos])

    // ── Input ─────────────────────────────────────────────────────────────────
    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setQuery(val); setActiveIdx(-1); setError(null)
        if (timerRef.current) clearTimeout(timerRef.current)
        if (!val.trim()) { setSuggestions([]); setCoordResult(null); setIsOpen(false); return }
        timerRef.current = setTimeout(() => fetchSuggestions(val), DEBOUNCE_MS)
    }

    // ── Fly to a suggestion (resolves Google place_id → lat/lon on demand) ────
    const flyTo = useCallback(async (s: Suggestion) => {
        setSuggestions([]); setIsOpen(false); setActiveIdx(-1)
        setQuery(s.primaryName)
        inputRef.current?.blur()

        let lat = s.lat, lon = s.lon

        if ((lat == null || lon == null) && s.placeId) {
            // Google result — resolve coordinates now
            setLoading(true)
            const resolved = await resolveGoogleLatLon(s.placeId).catch(() => null)
            setLoading(false)
            if (!resolved) return
            lat = resolved.lat; lon = resolved.lon
        }

        if (lat == null || lon == null) return

        mapFlyTo({ lat, lon, zoom: getZoomFromTypes(s.types) })
        setSearchPin({ lat, lon, label: s.primaryName })
    }, [mapFlyTo, setSearchPin])

    const flyToCoords = () => {
        if (!coordResult) return
        mapFlyTo({ lat: coordResult.lat, lon: coordResult.lon, zoom: 16 })
        setSearchPin({ lat: coordResult.lat, lon: coordResult.lon, label: 'Coordinates' })
        setIsOpen(false); inputRef.current?.blur()
    }

    // ── Keyboard nav ─────────────────────────────────────────────────────────
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (isOpen && suggestions.length) setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (isOpen && suggestions.length) setActiveIdx(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (coordResult) flyToCoords()
            else if (activeIdx >= 0 && suggestions[activeIdx]) flyTo(suggestions[activeIdx])
            else if (suggestions.length) flyTo(suggestions[0])
        } else if (e.key === 'Escape') {
            setIsOpen(false); setActiveIdx(-1); inputRef.current?.blur()
        }
    }

    const clearSearch = () => {
        setQuery(''); setSuggestions([]); setCoordResult(null)
        setIsOpen(false); setError(null); inputRef.current?.focus()
    }

    // ── Dropdown ──────────────────────────────────────────────────────────────
    const dropdown = isOpen && dropPos ? createPortal(
        <div
            ref={dropRef}
            className="map-search-dropdown"
            role="listbox"
            style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 999999 }}
        >
            {/* Coordinate shortcut */}
            {coordResult && (
                <button className="search-item search-item-coord" role="option" onClick={flyToCoords}>
                    <span className="search-item-icon">🎯</span>
                    <div className="search-item-text">
                        <span className="search-item-name">Navigate to coordinates</span>
                        <span className="search-item-context">
                            {coordResult.lat.toFixed(6)}, {coordResult.lon.toFixed(6)}
                        </span>
                    </div>
                    <span className="search-item-badge search-item-badge-coord">GPS</span>
                </button>
            )}

            {/* Results */}
            {suggestions.map((s, idx) => (
                <button
                    key={s.id}
                    className={`search-item${activeIdx === idx ? ' search-item-active' : ''}`}
                    role="option"
                    aria-selected={activeIdx === idx}
                    onClick={() => flyTo(s)}
                    onMouseEnter={() => setActiveIdx(idx)}
                >
                    <span className="search-item-icon">{getIcon(s.types)}</span>
                    <div className="search-item-text">
                        <span className="search-item-name">{s.primaryName}</span>
                        {s.context && <span className="search-item-context">{s.context}</span>}
                    </div>
                    <span className="search-item-badge">{getCatLabel(s.types, s.source)}</span>
                </button>
            ))}

            {/* Empty */}
            {!coordResult && !suggestions.length && !loading && !error && query.length >= 2 && (
                <div className="search-no-results">
                    <span>🔍</span>
                    <span>No results for "<strong>{query}</strong>"</span>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="search-no-results search-error">
                    <span>⚠️</span><span>{error}</span>
                </div>
            )}

            <div className="search-hint">
                <kbd>↑↓</kbd> Navigate &nbsp;·&nbsp;
                <kbd>Enter</kbd> Go &nbsp;·&nbsp;
                <kbd>Esc</kbd> Close &nbsp;·&nbsp;
                Tip: <em>28.61, 77.20</em> for coordinates
            </div>
        </div>,
        document.body
    ) : null

    return (
        <div className="map-search-container" role="search" ref={wrapperRef}>
            <div className="map-search-wrapper">
                <span className="map-search-icon">
                    {loading ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="search-spinner-icon">
                            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                            <path d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                    ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                        </svg>
                    )}
                </span>

                <input
                    ref={inputRef}
                    className="map-search-input"
                    type="text"
                    placeholder="Search places, industries, shops, roads…"
                    value={query}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (query.trim() && (suggestions.length || coordResult)) {
                            setIsOpen(true); computeDropPos()
                        }
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Search places"
                />

                {query && (
                    <button className="map-search-clear" onClick={clearSearch} title="Clear">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                )}
            </div>

            {dropdown}
        </div>
    )
}

export default MapSearchBar
