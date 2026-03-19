export type KmlGeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiGeometry' | 'Unknown'

export interface KmlCoordinate {
    lat: number
    lng: number
    alt?: number
}

export interface KmlStyle {
    lineColor?: string      // KML AABBGGRR → CSS rgba
    lineWidth?: number
    fillColor?: string
    fillOpacity?: number
    iconColor?: string
    iconScale?: number
}

export interface KmlPlacemark {
    id: string
    name: string
    description?: string
    geometryType: KmlGeometryType
    coordinates: KmlCoordinate[][]   // outer array = rings/parts; inner = coords
    style?: KmlStyle
    folderPath: string[]            // breadcrumb from root KML folder
}

export interface KmlFolder {
    id: string
    name: string
    children: KmlFolder[]
    placemarks: KmlPlacemark[]
    isOpen: boolean
}

export interface KmlLayer {
    id: string                  // unique per upload
    fileName: string            // original file name
    color: string               // auto-assigned color for map display
    visible: boolean
    rootFolder: KmlFolder       // parsed tree
    uploadedAt: string
    bounds?: [[number, number], [number, number]]  // [[minLat,minLng],[maxLat,maxLng]]
}
