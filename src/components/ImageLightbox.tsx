import React, { useEffect, useCallback, useRef, useState } from 'react'
import type { WheelEvent, MouseEvent } from 'react'
import { useStore } from '../store/useStore'
import { formatCoords, formatTimestamp } from '../utils/geoUtils'

const MIN_ZOOM = 1
const MAX_ZOOM = 8
const ZOOM_STEP = 0.35

const ImageLightbox: React.FC = () => {
    const { lightboxImage, closeLightbox, filteredImages, openLightbox, setSelectedImage } = useStore()

    // ── Zoom / pan state ──
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const dragging = useRef(false)
    const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })
    const imageAreaRef = useRef<HTMLDivElement>(null)

    // Reset zoom/pan when image changes
    useEffect(() => {
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }, [lightboxImage?.id])

    const currentIndex = lightboxImage
        ? filteredImages.findIndex((img) => img.id === lightboxImage.id)
        : -1

    const goPrev = useCallback(() => {
        if (currentIndex <= 0) return
        const prev = filteredImages[currentIndex - 1]
        openLightbox(prev)
        setSelectedImage(prev)
    }, [currentIndex, filteredImages, openLightbox, setSelectedImage])

    const goNext = useCallback(() => {
        if (currentIndex === -1 || currentIndex >= filteredImages.length - 1) return
        const next = filteredImages[currentIndex + 1]
        openLightbox(next)
        setSelectedImage(next)
    }, [currentIndex, filteredImages, openLightbox, setSelectedImage])

    const zoomIn = useCallback(() => {
        setZoom(z => Math.min(z + ZOOM_STEP, MAX_ZOOM))
    }, [])

    const zoomOut = useCallback(() => {
        setZoom(z => {
            const next = Math.max(z - ZOOM_STEP, MIN_ZOOM)
            if (next === MIN_ZOOM) setPan({ x: 0, y: 0 })
            return next
        })
    }, [])

    const resetZoom = useCallback(() => {
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }, [])

    // Keyboard shortcuts
    useEffect(() => {
        if (!lightboxImage) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeLightbox()
            if (e.key === 'ArrowLeft') goPrev()
            if (e.key === 'ArrowRight') goNext()
            if (e.key === '+' || e.key === '=') zoomIn()
            if (e.key === '-') zoomOut()
            if (e.key === '0') resetZoom()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [lightboxImage, closeLightbox, goPrev, goNext, zoomIn, zoomOut, resetZoom])

    useEffect(() => {
        document.body.style.overflow = lightboxImage ? 'hidden' : ''
        return () => { document.body.style.overflow = '' }
    }, [lightboxImage])

    // ── Wheel zoom (zoom toward cursor position) ──
    const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
        e.preventDefault()
        const rect = imageAreaRef.current?.getBoundingClientRect()
        if (!rect) return
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
        setZoom(prev => {
            const next = Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM)
            if (next === MIN_ZOOM) setPan({ x: 0, y: 0 })
            return next
        })
    }, [])

    // ── Drag to pan (only when zoomed) ──
    const handleMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
        if (zoom <= 1) return
        dragging.current = true
        dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
        e.preventDefault()
    }, [zoom, pan])

    const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
        if (!dragging.current) return
        const dx = e.clientX - dragStart.current.mx
        const dy = e.clientY - dragStart.current.my
        setPan({ x: dragStart.current.px + dx, y: dragStart.current.py + dy })
    }, [])

    const handleMouseUp = useCallback(() => {
        dragging.current = false
    }, [])

    if (!lightboxImage) return null

    const hasPrev = currentIndex > 0
    const hasNext = currentIndex < filteredImages.length - 1

    const typeLabel =
        lightboxImage.type === 'thermal' ? '🌡 Thermal'
            : lightboxImage.type === 'visual' ? '📷 Visual'
                : '❓ Unknown'

    const isZoomed = zoom > 1

    return (
        <div className="lightbox-overlay" onClick={closeLightbox} role="dialog" aria-modal="true">
            <div className="lightbox-panel" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="lightbox-header">
                    <div className="lightbox-title-row">
                        <span
                            className="lightbox-folder-pill"
                            style={{ background: lightboxImage.folderColor + '22', borderColor: lightboxImage.folderColor }}
                            title={`${lightboxImage.folderName}${lightboxImage.subFolderPath ? '/' + lightboxImage.subFolderPath : ''}`}
                        >
                            <span className="lightbox-folder-dot" style={{ background: lightboxImage.folderColor }} />
                            {lightboxImage.folderName}{lightboxImage.subFolderPath ? `/${lightboxImage.subFolderPath}` : ''}
                        </span>
                        <span className="lightbox-filename">{lightboxImage.name}</span>
                        <span className={`lightbox-type-badge type-${lightboxImage.type}`}>{typeLabel}</span>
                    </div>
                    <div className="lightbox-header-right">
                        <span className="lightbox-counter">{currentIndex + 1} / {filteredImages.length}</span>
                        <button className="lightbox-close" onClick={closeLightbox} aria-label="Close">✕</button>
                    </div>
                </div>

                {/* Image area with zoom/pan */}
                <div
                    ref={imageAreaRef}
                    className={`lightbox-image-area ${isZoomed ? 'lb-zoomed' : ''}`}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {/* Prev / Next nav */}
                    <button className={`lightbox-nav prev ${!hasPrev ? 'disabled' : ''}`}
                        onClick={goPrev} disabled={!hasPrev}>‹</button>

                    {lightboxImage.objectUrl
                        ? <img
                            key={lightboxImage.id}
                            src={lightboxImage.objectUrl}
                            alt={lightboxImage.name}
                            className="lightbox-img"
                            draggable={false}
                            style={{
                                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                                transformOrigin: 'center center',
                                transition: dragging.current ? 'none' : 'transform 0.15s ease',
                                cursor: isZoomed ? (dragging.current ? 'grabbing' : 'grab') : 'default',
                                userSelect: 'none',
                            }}
                        />
                        : <div className="lightbox-no-img">📷 No preview available</div>
                    }

                    <button className={`lightbox-nav next ${!hasNext ? 'disabled' : ''}`}
                        onClick={goNext} disabled={!hasNext}>›</button>

                    {/* Zoom controls — floating panel bottom-right of image area */}
                    <div className="lb-zoom-controls">
                        <button className="lb-zoom-btn" onClick={zoomOut} title="Zoom out (-)">−</button>
                        <button className="lb-zoom-reset" onClick={resetZoom} title="Reset zoom (0)">
                            {Math.round(zoom * 100)}%
                        </button>
                        <button className="lb-zoom-btn" onClick={zoomIn} title="Zoom in (+)">+</button>
                    </div>
                </div>

                {/* Meta strip */}
                <div className="lightbox-meta">
                    <div className="lightbox-meta-item">
                        <span className="lm-label">📍 Coordinates</span>
                        <span className="lm-val">{formatCoords(lightboxImage.latitude, lightboxImage.longitude)}</span>
                    </div>
                    <div className="lightbox-meta-item">
                        <span className="lm-label">⬆ Altitude</span>
                        <span className="lm-val">{lightboxImage.altitude.toFixed(1)} m</span>
                    </div>
                    <div className="lightbox-meta-item">
                        <span className="lm-label">🕐 Captured</span>
                        <span className="lm-val">{formatTimestamp(lightboxImage.timestamp)}</span>
                    </div>
                    <div className="lightbox-meta-item keyboard-hint">
                        <span className="lm-label">⌨ Keys</span>
                        <span className="lm-val">← → navigate &nbsp;|&nbsp; +/- zoom &nbsp;|&nbsp; 0 reset &nbsp;|&nbsp; Esc close</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ImageLightbox
