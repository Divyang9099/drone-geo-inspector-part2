import React, { memo } from 'react'
import type { ImageData } from '../types/ImageData'
import { formatCoords, formatTimestamp } from '../utils/geoUtils'

interface ImageCardProps {
    image: ImageData
    isSelected: boolean
    onClick: (image: ImageData) => void
    onOpenPhoto: (image: ImageData) => void
}

const ImageCard: React.FC<ImageCardProps> = memo(({ image, isSelected, onClick, onOpenPhoto }) => {
    const typeColor =
        image.type === 'thermal'
            ? 'badge-thermal'
            : image.type === 'visual'
                ? 'badge-visual'
                : 'badge-unknown'

    const typeLabel =
        image.type === 'thermal'
            ? '🌡 Thermal'
            : image.type === 'visual'
                ? '📷 Visual'
                : '❓ Unknown'

    return (
        <div
            className={`image-card ${isSelected ? 'selected' : ''}`}
            onClick={() => onClick(image)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick(image)}
        >
            {/* Thumbnail — clicking the image itself opens lightbox */}
            <div className="image-card-thumb">
                {image.objectUrl ? (
                    <>
                        <img src={image.objectUrl} alt={image.name} loading="lazy" />
                        <div
                            className="card-thumb-hover"
                            onClick={(e) => {
                                e.stopPropagation()
                                onOpenPhoto(image)
                            }}
                            title="Open full photo"
                        >
                            <span className="card-zoom-icon">🔍</span>
                        </div>
                    </>
                ) : (
                    <div className="thumb-placeholder">
                        <span>📷</span>
                    </div>
                )}
                <span className={`type-badge ${typeColor}`}>{typeLabel}</span>
            </div>

            {/* Info */}
            <div className="image-card-info">
                <p className="image-name" title={image.name}>
                    {image.name}
                </p>
                <p className="image-coords">📍 {formatCoords(image.latitude, image.longitude)}</p>
                <div className="image-meta-row">
                    <span className="meta-item">⬆ {image.altitude.toFixed(1)}m</span>
                    {image.timestamp && (
                        <span className="meta-item">🕐 {formatTimestamp(image.timestamp)}</span>
                    )}
                </div>
            </div>
        </div>
    )
})

ImageCard.displayName = 'ImageCard'

export default ImageCard
