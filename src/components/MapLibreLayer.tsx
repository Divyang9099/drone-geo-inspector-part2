import React, { useEffect } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import '@maplibre/maplibre-gl-leaflet'

interface MapLibreLayerProps {
    style: any; // MapLibre style object or URL
    opacity?: number;
}

const MapLibreLayer: React.FC<MapLibreLayerProps> = ({ style, opacity = 1 }) => {
    const map = useMap()

    useEffect(() => {
        // @ts-ignore - maplibreGL is added by the plugin
        if (!L.maplibreGL) return

        // @ts-ignore
        const glLayer = L.maplibreGL({
            style: style,
            opacity: opacity,
            noWrap: true,
            interactive: false // Keep it background
        }).addTo(map)

        return () => {
            map.removeLayer(glLayer)
        }
    }, [map, style, opacity])

    return null
}

export default MapLibreLayer
