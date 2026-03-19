import type { ImageData } from '../types/ImageData'

/**
 * Sort images by timestamp ascending. Images without timestamps go to end.
 */
export function sortByTimestamp(images: ImageData[]): ImageData[] {
    return [...images].sort((a, b) => {
        if (!a.timestamp && !b.timestamp) return 0
        if (!a.timestamp) return 1
        if (!b.timestamp) return -1
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    })
}

/**
 * Filter images by type
 */
export function filterByType(
    images: ImageData[],
    type: 'all' | 'thermal' | 'visual'
): ImageData[] {
    if (type === 'all') return images
    return images.filter((img) => img.type === type)
}

/**
 * Get bounds from a list of images as [[minLat, minLng], [maxLat, maxLng]]
 */
export function getImageBounds(
    images: ImageData[]
): [[number, number], [number, number]] | null {
    if (images.length === 0) return null
    let minLat = Infinity,
        maxLat = -Infinity,
        minLng = Infinity,
        maxLng = -Infinity

    for (const img of images) {
        minLat = Math.min(minLat, img.latitude)
        maxLat = Math.max(maxLat, img.latitude)
        minLng = Math.min(minLng, img.longitude)
        maxLng = Math.max(maxLng, img.longitude)
    }

    return [
        [minLat, minLng],
        [maxLat, maxLng],
    ]
}

/**
 * Format coordinates to 6 decimal places
 */
export function formatCoords(lat: number, lng: number): string {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

/**
 * Format timestamp to readable string
 */
export function formatTimestamp(ts?: string): string {
    if (!ts) return 'N/A'
    try {
        return new Date(ts).toLocaleString()
    } catch {
        return ts
    }
}
