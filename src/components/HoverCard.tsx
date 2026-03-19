import React, { useState } from 'react'
import { useStore } from '../store/useStore'
import { formatCoords } from '../utils/geoUtils'
import type { ImageData } from '../types/ImageData'

const HoverCard: React.FC = () => {
    const {
        hoveredImages,
        hoverPosition,
        openLightbox,
        setSelectedImage,
        setHoveredImage,
        keepHoverAlive,
        scheduleHoverClear,
    } = useStore()

    const [activeIdx, setActiveIdx] = useState(0)

    if (!hoveredImages.length || !hoverPosition) return null

    // Reset tab if out of range
    const safeIdx = Math.min(activeIdx, hoveredImages.length - 1)
    const image: ImageData = hoveredImages[safeIdx]

    // Smart position: flip left if near right edge, flip up if near bottom
    const CARD_W = 260
    const CARD_H = hoveredImages.length > 1 ? 268 : 238
    const MARGIN = 16

    let left = hoverPosition.x + MARGIN
    let top = hoverPosition.y - 10

    if (hoverPosition.x > 550) left = hoverPosition.x - CARD_W - MARGIN
    if (hoverPosition.y > 300) top = hoverPosition.y - CARD_H - MARGIN
    if (left < 4) left = 4
    if (top < 4) top = 4

    const typeLabel =
        image.type === 'thermal' ? '🌡 Thermal'
            : image.type === 'visual' ? '📷 Visual'
                : '❓ Unknown'

    const closeCard = () => setHoveredImage(null, null)

    return (
        <div
            className="hover-card"
            style={{ left, top }}
            onMouseEnter={keepHoverAlive}
            onMouseLeave={scheduleHoverClear}
        >
            {/* Folder color stripe */}
            <div className="hover-card-stripe" style={{ background: image.folderColor }} />

            {/* Close ✕ button */}
            <button className="hover-card-close" onClick={closeCard} title="Close">✕</button>

            {/* Tab bar — only visible when multiple images at same location */}
            {hoveredImages.length > 1 && (
                <div className="hover-card-tabs">
                    {hoveredImages.map((img, i) => (
                        <button
                            key={img.id}
                            className={`hover-tab-btn ${i === safeIdx ? 'active' : ''}`}
                            style={{ borderBottomColor: i === safeIdx ? img.folderColor : 'transparent' }}
                            onClick={() => setActiveIdx(i)}
                            title={img.name}
                        >
                            <span
                                className="hover-tab-dot"
                                style={{ background: img.type === 'thermal' ? '#f97316' : img.folderColor }}
                            />
                            {img.type === 'thermal' ? '🌡' : '📷'}
                            <span className="hover-tab-label">{i + 1}</span>
                        </button>
                    ))}
                    <span className="hover-tab-count">{hoveredImages.length} at this point</span>
                </div>
            )}

            {/* Thumbnail */}
            {image.objectUrl && (
                <img
                    src={image.objectUrl}
                    alt={image.name}
                    className="hover-card-thumb"
                />
            )}

            <div className="hover-card-body">
                <div className="hover-card-header">
                    <span className="hover-card-type">{typeLabel}</span>
                    <span
                        className="hover-card-folder-dot"
                        style={{ background: image.folderColor }}
                        title={`${image.folderName}${image.subFolderPath ? '/' + image.subFolderPath : ''}`}
                    />
                </div>

                <p className="hover-card-name" title={image.name}>{image.name}</p>
                <p className="hover-card-folder" title={`${image.folderName}${image.subFolderPath ? '/' + image.subFolderPath : ''}`}>
                    📁 {image.folderName}{image.subFolderPath ? `/${image.subFolderPath}` : ''}
                </p>

                <div className="hover-card-meta">
                    <span>📍 {formatCoords(image.latitude, image.longitude)}</span>
                    <span>⬆ {image.altitude.toFixed(1)} m</span>
                </div>

                <button
                    className="hover-card-btn"
                    onClick={() => {
                        setSelectedImage(image)
                        openLightbox(image)
                        closeCard()
                    }}
                >
                    🖼 Full View
                </button>
            </div>
        </div>
    )
}

export default HoverCard
