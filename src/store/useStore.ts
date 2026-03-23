import { create } from 'zustand'
import type { ImageData } from '../types/ImageData'
import type { FolderData } from '../types/FolderData'
import type { KmlLayer } from '../types/KmlData'
import { calculateTotalDistance } from '../utils/distance'
import { sortByTimestamp } from '../utils/geoUtils'

export type MapLayer = 'google-satellite' | 'google-hybrid' | 'esri' | 'street' | 'inframap'
export type FilterType = 'all' | 'thermal' | 'visual'

export const FOLDER_COLORS = [
    '#ef4444', '#3b82f6', '#22c55e', '#f97316', '#a855f7',
    '#ec4899', '#eab308', '#14b8a6', '#6366f1', '#f43f5e',
]

export const KML_COLORS = [
    '#06b6d4', '#84cc16', '#f59e0b', '#8b5cf6', '#10b981',
    '#f43f5e', '#60a5fa', '#fb923c', '#a3e635', '#c084fc',
]

export interface HoverPosition { x: number; y: number }

// Module-level timer — not reactive, just a side-effect handle
let hoverTimer: ReturnType<typeof setTimeout> | null = null

function applyFilter(images: ImageData[], type: FilterType): ImageData[] {
    if (type === 'all') return images
    return images.filter((img) => img.type === type)
}

function computeAll(folders: FolderData[], filter: FilterType) {
    const allImages = folders.flatMap((f) => f.images)
    const sorted = sortByTimestamp(allImages)
    const filtered = applyFilter(sorted, filter)
    const distance = calculateTotalDistance(sorted)
    return { allImages: sorted, filteredImages: filtered, totalDistance: distance }
}

interface AppState {
    // ── Image Folders ────────────────────────────────────────────
    folders: FolderData[]
    allImages: ImageData[]           // sorted union of all folders
    filteredImages: ImageData[]      // filtered subset
    selectedImage: ImageData | null
    hoveredImages: ImageData[]
    hoverPosition: HoverPosition | null
    lightboxImage: ImageData | null
    filterType: FilterType
    mapLayer: MapLayer
    loading: boolean
    loadingFolderName: string
    progress: { current: number; total: number }
    totalDistance: number
    showPath: boolean
    expandedFolders: Set<string>
    pendingCard: ImageData | null     // image whose card should open after flyTo
    /** Currently focused subfolder for map filtering. null = all images shown */
    focusedSubFolder: { folderId: string; subPath: string } | null

    // ── KML Layers ────────────────────────────────────────────────
    kmlLayers: KmlLayer[]
    kmlLoading: boolean
    kmlLoadingName: string
    kmlExpandedFolders: Set<string>

    // KML interaction
    selectedKmlPlacemarkId: string | null
    hoveredKmlPlacemarkId: string | null
    // One-shot: set by FileManager click, cleared by KmlFitBoundsHandler after flyToBounds
    pendingKmlBounds: [[number, number], [number, number]] | null

    // ── Infrastructure Layers (Vector) ──────────────────────────
    infraVisibility: {
        power: boolean;
        solar: boolean;
        water: boolean;
        telecoms: boolean;
    }
    toggleInfraVisibility: (layer: keyof AppState['infraVisibility']) => void

    // ── Map fly-to target (from search bar) ──────────────────────
    mapFlyToTarget: { lat: number; lon: number; zoom: number; ts: number } | null
    mapFlyTo: (target: { lat: number; lon: number; zoom: number }) => void
    clearMapFlyTo: () => void

    // ── Search coordinate pin ────────────────────────────────────
    searchPin: { lat: number; lon: number; label?: string } | null
    setSearchPin: (pin: { lat: number; lon: number; label?: string } | null) => void

    // Actions (images)
    addFolder: (folder: FolderData) => void
    removeFolder: (folderId: string) => void
    setSelectedImage: (image: ImageData | null) => void
    setHoveredImage: (image: ImageData | null, pos: HoverPosition | null) => void
    setHoveredImages: (images: ImageData[], pos: HoverPosition | null) => void
    scheduleHoverClear: () => void      // start 250ms delayed hide
    keepHoverAlive: () => void          // cancel the pending hide (card mouseenter)
    openLightbox: (image: ImageData) => void
    closeLightbox: () => void
    setFilterType: (type: FilterType) => void
    setMapLayer: (layer: MapLayer) => void
    setLoading: (loading: boolean, folderName?: string) => void
    setProgress: (current: number, total: number) => void
    toggleFolderExpanded: (folderId: string) => void
    togglePath: () => void
    setPendingCard: (img: ImageData | null) => void
    /**
     * Focus the map to a specific subfolder.
     * - subPath=null  → clear focus (root folder clicked) — shows all images
     * - subPath='a/b' → show only images in that subfolder + descendants
     */
    setFocusedSubFolder: (folderId: string, subPath: string | null) => void
    clearAll: () => void

    // Actions (KML)
    addKmlLayer: (layer: KmlLayer) => void
    removeKmlLayer: (layerId: string) => void
    toggleKmlLayerVisible: (layerId: string) => void
    toggleKmlFolderExpanded: (folderId: string) => void
    setKmlLoading: (loading: boolean, name?: string) => void
    clearAllKml: () => void
    setSelectedKmlPlacemark: (id: string | null, bounds: [[number, number], [number, number]] | null) => void
    setHoveredKmlPlacemark: (id: string | null) => void
    clearPendingKmlBounds: () => void
}

export const useStore = create<AppState>((set, get) => ({
    folders: [],
    allImages: [],
    filteredImages: [],
    selectedImage: null,
    hoveredImages: [],
    hoverPosition: null,
    lightboxImage: null,
    filterType: 'all',
    mapLayer: 'google-satellite',
    loading: false,
    loadingFolderName: '',
    progress: { current: 0, total: 0 },
    totalDistance: 0,
    showPath: false,
    expandedFolders: new Set(),
    pendingCard: null,
    focusedSubFolder: null,

    kmlLayers: [],
    kmlLoading: false,
    kmlLoadingName: '',
    kmlExpandedFolders: new Set(),
    selectedKmlPlacemarkId: null,
    hoveredKmlPlacemarkId: null,
    pendingKmlBounds: null,

    infraVisibility: {
        power: true,
        solar: true,
        water: true,
        telecoms: true,
    },
    toggleInfraVisibility: (layer) => set(s => ({
        infraVisibility: { ...s.infraVisibility, [layer]: !s.infraVisibility[layer] }
    })),

    mapFlyToTarget: null,
    mapFlyTo: (target) => set({ mapFlyToTarget: { ...target, ts: Date.now() } }),
    clearMapFlyTo: () => set({ mapFlyToTarget: null }),

    searchPin: null,
    setSearchPin: (pin) => set({ searchPin: pin }),

    // ── Image folder actions ─────────────────────────────────────
    addFolder: (folder) => {
        const newFolders = [...get().folders, folder]
        const computed = computeAll(newFolders, get().filterType)
        const expanded = new Set(get().expandedFolders)
        expanded.add(folder.id)
        set({ folders: newFolders, ...computed, expandedFolders: expanded })
    },

    removeFolder: (folderId) => {
        // Revoke object URLs for this folder
        const folder = get().folders.find((f) => f.id === folderId)
        folder?.images.forEach((img) => {
            if (img.objectUrl) URL.revokeObjectURL(img.objectUrl)
        })
        const newFolders = get().folders.filter((f) => f.id !== folderId)
        const computed = computeAll(newFolders, get().filterType)
        // Also clear subfolder focus if it belonged to this folder
        const focus = get().focusedSubFolder
        const clearFocus = focus?.folderId === folderId ? { focusedSubFolder: null } : {}
        set({ folders: newFolders, ...computed, selectedImage: null, hoveredImages: [], ...clearFocus })
    },

    setSelectedImage: (image) => set({ selectedImage: image }),

    setHoveredImage: (image, pos) => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
        set({ hoveredImages: image ? [image] : [], hoverPosition: pos })
    },

    setHoveredImages: (images, pos) => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
        set({ hoveredImages: images, hoverPosition: pos })
    },

    scheduleHoverClear: () => {
        if (hoverTimer) clearTimeout(hoverTimer)
        hoverTimer = setTimeout(() => {
            hoverTimer = null
            set({ hoveredImages: [], hoverPosition: null })
        }, 200)   // 200ms — time to move from marker to card without flicker
    },

    keepHoverAlive: () => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
    },

    openLightbox: (image) => set({ lightboxImage: image }),
    closeLightbox: () => set({ lightboxImage: null }),

    setFilterType: (type) => {
        const computed = computeAll(get().folders, type)
        set({ filterType: type, ...computed, selectedImage: null })
    },

    setMapLayer: (layer) => set({ mapLayer: layer }),

    setLoading: (loading, folderName = '') =>
        set({ loading, loadingFolderName: folderName }),

    setProgress: (current, total) => set({ progress: { current, total } }),

    toggleFolderExpanded: (folderId) => {
        const next = new Set(get().expandedFolders)
        if (next.has(folderId)) next.delete(folderId)
        else next.add(folderId)
        set({ expandedFolders: next })
    },

    togglePath: () => set((s) => ({ showPath: !s.showPath })),

    setPendingCard: (img) => set({ pendingCard: img }),

    setFocusedSubFolder: (folderId, subPath) => {
        if (subPath === null) {
            // Root folder clicked → clear all focus → map shows everything again
            set({ focusedSubFolder: null })
        } else {
            // Subfolder clicked → focus map to this path (no toggle; stays until cleared)
            set({ focusedSubFolder: { folderId, subPath } })
        }
    },

    clearAll: () => {
        get().allImages.forEach((img) => {
            if (img.objectUrl) URL.revokeObjectURL(img.objectUrl)
        })
        set({
            folders: [],
            allImages: [],
            filteredImages: [],
            selectedImage: null,
            hoveredImages: [],
            hoverPosition: null,
            lightboxImage: null,
            filterType: 'all',
            loading: false,
            loadingFolderName: '',
            progress: { current: 0, total: 0 },
            totalDistance: 0,
            showPath: false,
            expandedFolders: new Set(),
            pendingCard: null,
        })
    },

    // ── KML layer actions ────────────────────────────────────────
    addKmlLayer: (layer) => {
        // Auto-expand root folder and all top-level children
        const expanded = new Set(get().kmlExpandedFolders)
        expanded.add(layer.rootFolder.id)
        layer.rootFolder.children.forEach(c => expanded.add(c.id))

        set({
            kmlLayers: [...get().kmlLayers, layer],
            kmlExpandedFolders: expanded,
            kmlLoading: false,
            kmlLoadingName: '',
        })
    },

    removeKmlLayer: (layerId) => {
        set({ kmlLayers: get().kmlLayers.filter(l => l.id !== layerId) })
    },

    toggleKmlLayerVisible: (layerId) => {
        set({
            kmlLayers: get().kmlLayers.map(l =>
                l.id === layerId ? { ...l, visible: !l.visible } : l
            ),
        })
    },

    toggleKmlFolderExpanded: (folderId) => {
        const next = new Set(get().kmlExpandedFolders)
        if (next.has(folderId)) next.delete(folderId)
        else next.add(folderId)
        set({ kmlExpandedFolders: next })
    },

    setKmlLoading: (loading, name = '') =>
        set({ kmlLoading: loading, kmlLoadingName: name }),

    clearAllKml: () => {
        set({ kmlLayers: [], kmlExpandedFolders: new Set(), selectedKmlPlacemarkId: null, hoveredKmlPlacemarkId: null, pendingKmlBounds: null })
    },

    setSelectedKmlPlacemark: (id, bounds) =>
        set({ selectedKmlPlacemarkId: id, pendingKmlBounds: bounds }),

    setHoveredKmlPlacemark: (id) =>
        set({ hoveredKmlPlacemarkId: id }),

    clearPendingKmlBounds: () =>
        set({ pendingKmlBounds: null }),
}))
