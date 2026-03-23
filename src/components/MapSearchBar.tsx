import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'

interface Suggestion {
    place_id: string | number
    display_name: string
    lat: string
    lon: string
    type: string
    class: string
    address?: {
        city?: string
        town?: string
        village?: string
        state?: string
        country?: string
    }
}

// Detect if input looks like coordinates: "lat, lon"  or  "lat lon"  or  "28°N 77°E"
function parseCoordinates(input: string): { lat: number; lon: number } | null {
    const plain = input.trim().replace(/[°NnSsEeWw]/g, '').replace(/\s+/g, ' ')
    const parts = plain.split(/[,\s]+/).filter(Boolean)
    if (parts.length === 2) {
        const lat = parseFloat(parts[0])
        const lon = parseFloat(parts[1])
        if (
            !isNaN(lat) && !isNaN(lon) &&
            lat >= -90 && lat <= 90 &&
            lon >= -180 && lon <= 180
        ) {
            return { lat, lon }
        }
    }
    return null
}

const DEBOUNCE_MS = 300

const MapSearchBar: React.FC = () => {
    const [query, setQuery] = useState('')
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [activeIdx, setActiveIdx] = useState(-1)
    const [coordResult, setCoordResult] = useState<{ lat: number; lon: number } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)

    const wrapperRef = useRef<HTMLDivElement>(null)
    const dropRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const abortRef = useRef<AbortController | null>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const { mapFlyTo, setSearchPin } = useStore()

    const computeDropPos = useCallback(() => {
        if (!wrapperRef.current) return
        const rect = wrapperRef.current.getBoundingClientRect()
        setDropPos({
            top: rect.bottom + 6,
            left: rect.left,
            width: Math.max(rect.width, 420),
        })
    }, [])

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            abortRef.current?.abort()
        }
    }, [])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node
            const insideWrapper = wrapperRef.current?.contains(target)
            const insideDrop = dropRef.current?.contains(target)
            if (!insideWrapper && !insideDrop) {
                setIsOpen(false)
                setActiveIdx(-1)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    useEffect(() => {
        if (isOpen) {
            computeDropPos()
            window.addEventListener('resize', computeDropPos)
            window.addEventListener('scroll', computeDropPos, true)
            return () => {
                window.removeEventListener('resize', computeDropPos)
                window.removeEventListener('scroll', computeDropPos, true)
            }
        }
    }, [isOpen, computeDropPos])

    const fetchSuggestions = useCallback(async (text: string) => {
        if (text.length < 2) {
            setSuggestions([])
            setIsOpen(false)
            return
        }

        const coords = parseCoordinates(text)
        if (coords) {
            setCoordResult(coords)
            setSuggestions([])
            setLoading(false)
            setIsOpen(true)
            computeDropPos()
            return
        }
        setCoordResult(null)

        abortRef.current?.abort()
        abortRef.current = new AbortController()
        setLoading(true)
        setError(null)

        try {
            // We use PHOTON API (powered by OSM) which is much better at "Google-like" fuzzy POI search.
            // It has better searching for infrastructure and specific names.
            const url = new URL('https://photon.komoot.io/api/')
            url.searchParams.set('q', text)
            url.searchParams.set('limit', '10')
            // Prioritize results in India [lon_min, lat_min, lon_max, lat_max]
            // India-ish bbox: [68, 8, 97, 37]
            url.searchParams.set('bbox', '68,8,97,37')
            url.searchParams.set('lang', 'en')

            const res = await fetch(url.toString(), {
                signal: abortRef.current.signal
            })
            const data = await res.json()
            
            // Map Photon results to our Suggestion format
            const mapped: Suggestion[] = data.features.map((f: any, i: number) => {
                const p = f.properties
                const [lon, lat] = f.geometry.coordinates
                
                // Construct a display name similar to standard address
                const parts = [
                    p.name,
                    p.street,
                    p.district,
                    p.city || p.town || p.village,
                    p.state,
                    p.country
                ].filter(Boolean)

                return {
                    place_id: `photon-${i}-${lat}-${lon}`,
                    display_name: parts.join(', '),
                    lat: String(lat),
                    lon: String(lon),
                    type: p.osm_value || p.type || 'place',
                    class: p.osm_key || 'place',
                    address: {
                        city: p.city || p.town || p.village,
                        state: p.state,
                        country: p.country
                    }
                }
            })

            setSuggestions(mapped)
            setIsOpen(true)
            computeDropPos()
        } catch (e: unknown) {
            if ((e as Error).name !== 'AbortError') {
                setError('Search failed. Check your connection.')
                setIsOpen(true)
                computeDropPos()
            }
        } finally {
            setLoading(false)
        }
    }, [computeDropPos])

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setQuery(val)
        setActiveIdx(-1)
        setError(null)

        if (timerRef.current) clearTimeout(timerRef.current)

        if (!val.trim()) {
            setSuggestions([])
            setCoordResult(null)
            setIsOpen(false)
            return
        }
        timerRef.current = setTimeout(() => fetchSuggestions(val), DEBOUNCE_MS)
    }

    const flyToSuggestion = (s: Suggestion) => {
        const lat = parseFloat(s.lat)
        const lon = parseFloat(s.lon)
        if (isNaN(lat) || isNaN(lon)) return

        let zoom = 13
        const cls = s.class
        const typ = s.type
        if (cls === 'boundary' || typ === 'administrative') {
            if (s.address?.country && !s.address?.state) zoom = 5
            else if (s.address?.state && !s.address?.city) zoom = 7
            else zoom = 11
        } else if (typ === 'city' || typ === 'town') {
            zoom = 12
        } else if (typ === 'village' || typ === 'hamlet') {
            zoom = 14
        } else if (typ === 'suburb' || typ === 'neighbourhood') {
            zoom = 15
        } else {
            zoom = 16 // POI zoom
        }

        mapFlyTo({ lat, lon, zoom })
        setSearchPin({ lat, lon, label: s.display_name.split(',')[0] })

        const parts = s.display_name.split(',')
        setQuery(parts.slice(0, 2).join(',').trim())
        setSuggestions([])
        setIsOpen(false)
        setActiveIdx(-1)
        inputRef.current?.blur()
    }

    const flyToCoords = () => {
        if (!coordResult) return
        mapFlyTo({ lat: coordResult.lat, lon: coordResult.lon, zoom: 16 })
        setSearchPin({ lat: coordResult.lat, lon: coordResult.lon, label: 'Coordinates' })
        setIsOpen(false)
        inputRef.current?.blur()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (isOpen && suggestions.length > 0) setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (isOpen && suggestions.length > 0) setActiveIdx(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (coordResult) {
                flyToCoords()
            } else if (suggestions.length > 0 && activeIdx >= 0) {
                flyToSuggestion(suggestions[activeIdx])
            } else if (suggestions.length > 0) {
                flyToSuggestion(suggestions[0])
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false)
            setActiveIdx(-1)
            inputRef.current?.blur()
        }
    }

    const clearSearch = () => {
        setQuery('')
        setSuggestions([])
        setCoordResult(null)
        setIsOpen(false)
        setError(null)
        inputRef.current?.focus()
    }

    const getLabel = (s: Suggestion) => {
        const parts = s.display_name.split(',').map(p => p.trim())
        return { name: parts[0], context: parts.slice(1, 4).join(', ') }
    }

    const getTypeIcon = (s: Suggestion) => {
        const t = s.type?.toLowerCase() || ''
        const cls = s.class?.toLowerCase() || ''
        
        if (t === 'city' || t === 'town' || t === 'municipality') return '🏙️'
        if (t === 'village' || t === 'hamlet') return '🏘️'
        if (t.includes('state') || t === 'region') return '🗺️'
        if (t === 'country') return '🌏'
        if (t === 'suburb' || t === 'neighbourhood') return '🏠'
        if (t === 'airport' || cls === 'aeroway') return '✈️'
        if (t === 'river' || t === 'lake' || t === 'water' || cls === 'waterway') return '💧'
        if (cls === 'power' || t.includes('solar') || t.includes('substation') || t.includes('grid')) return '⚡'
        if (cls === 'highway') return '🛣️'
        if (cls === 'railway') return '🚉'
        if (cls === 'amenity') return '📍'
        if (cls === 'tourism') return '🏛️'
        if (t.includes('plant') || cls === 'industrial') return '🏭'
        return '📍'
    }

    const portalDropdown = isOpen && dropPos ? createPortal(
        <div
            ref={dropRef}
            id="map-search-dropdown"
            className="map-search-dropdown"
            role="listbox"
            aria-label="Search suggestions"
            style={{
                position: 'fixed',
                top: dropPos.top,
                left: dropPos.left,
                width: dropPos.width,
                zIndex: 999999,
            }}
        >
            {coordResult && (
                <button
                    className="search-item search-item-coord"
                    role="option"
                    aria-selected={true}
                    onClick={flyToCoords}
                >
                    <span className="search-item-icon">🎯</span>
                    <div className="search-item-text">
                        <span className="search-item-name">Navigate to coordinates</span>
                        <span className="search-item-context">
                            Lat {coordResult.lat.toFixed(6)},&nbsp; Lon {coordResult.lon.toFixed(6)}
                        </span>
                    </div>
                    <span className="search-item-badge search-item-badge-coord">GPS</span>
                </button>
            )}

            {suggestions.map((s, idx) => {
                const { name, context } = getLabel(s)
                return (
                    <button
                        key={s.place_id}
                        id={`search-item-${idx}`}
                        className={`search-item${activeIdx === idx ? ' search-item-active' : ''}`}
                        role="option"
                        aria-selected={activeIdx === idx}
                        onClick={() => flyToSuggestion(s)}
                        onMouseEnter={() => setActiveIdx(idx)}
                    >
                        <span className="search-item-icon">{getTypeIcon(s)}</span>
                        <div className="search-item-text">
                            <span className="search-item-name">{name}</span>
                            {context && <span className="search-item-context">{context}</span>}
                        </div>
                        <span className="search-item-badge">{s.type}</span>
                    </button>
                )
            })}

            {!coordResult && suggestions.length === 0 && !loading && !error && query.length >= 2 && (
                <div className="search-no-results">
                    <span>🔍</span>
                    <span>No results found for "<strong>{query}</strong>"</span>
                </div>
            )}

            {error && (
                <div className="search-no-results search-error">
                    <span>⚠️</span>
                    <span>{error}</span>
                </div>
            )}

            <div className="search-hint">
                <kbd>↑↓</kbd> Navigate &nbsp;·&nbsp;
                <kbd>Enter</kbd> Go &nbsp;·&nbsp;
                <kbd>Esc</kbd> Close &nbsp;·&nbsp;
                Tip: Enter coordinates like <em>28.61, 77.20</em>
            </div>
        </div>,
        document.body
    ) : null

    return (
        <div className="map-search-container" role="search" ref={wrapperRef}>
            <div className="map-search-wrapper">
                <span className="map-search-icon" aria-hidden="true">
                    {loading ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="search-spinner-icon">
                            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                            <path d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                    ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.35-4.35" />
                        </svg>
                    )}
                </span>

                <input
                    ref={inputRef}
                    id="map-search-input"
                    className="map-search-input"
                    type="text"
                    placeholder="Search any place, city, shop or coordinates…"
                    value={query}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (query.trim() && (suggestions.length > 0 || coordResult)) {
                            setIsOpen(true)
                            computeDropPos()
                        }
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Search places"
                />

                {query && (
                    <button
                        className="map-search-clear"
                        onClick={clearSearch}
                        title="Clear search"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                )}
            </div>

            {portalDropdown}
        </div>
    )
}

export default MapSearchBar
