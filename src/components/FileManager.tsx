import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useStore } from '../store/useStore'
import type { ImageData } from '../types/ImageData'
import type { FolderData } from '../types/FolderData'
import type { KmlFolder, KmlLayer, KmlPlacemark } from '../types/KmlData'
import { placemarkBounds, folderBounds } from '../utils/kmlParser'

// ──────────────────────────────────────────────────────────────────────────────
//  VIRTUAL IMAGE TREE
//  Built at render time from the flat images[] + their subFolderPath fields.
// ──────────────────────────────────────────────────────────────────────────────
interface VNode {
    name: string
    path: string            // e.g. 'DJI_049/DJI_008'
    images: ImageData[]
    children: VNode[]
}

function buildTree(images: ImageData[]): VNode {
    const root: VNode = { name: '__root__', path: '', images: [], children: [] }

    for (const img of images) {
        const parts = img.subFolderPath ? img.subFolderPath.split('/') : []
        let cur = root
        let pathSoFar = ''
        for (const seg of parts) {
            pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg
            let child = cur.children.find(c => c.name === seg)
            if (!child) {
                child = { name: seg, path: pathSoFar, images: [], children: [] }
                cur.children.push(child)
            }
            cur = child
        }
        cur.images.push(img)
    }
    return root
}

/** Count total images in a VNode (recursive) */
function countImages(node: VNode): number {
    return node.images.length + node.children.reduce((s, c) => s + countImages(c), 0)
}

// ──────────────────────────────────────────────────────────────────────────────
//  IMAGE ROW (leaf)
// ──────────────────────────────────────────────────────────────────────────────
interface ImageRowProps {
    image: ImageData
    isSelected: boolean
    isHovered: boolean
    depth: number
    onClick: () => void
}

const ImageRow: React.FC<ImageRowProps> = React.memo(({ image, isSelected, isHovered, depth, onClick }) => {
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (isHovered && ref.current) ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, [isHovered])

    const typeIcon = image.type === 'thermal' ? '🌡️' : image.type === 'visual' ? '📷' : '📸'
    const indent = depth * 14

    return (
        <div
            ref={ref}
            className={`fmi-row${isSelected ? ' fmi-selected' : ''}${isHovered ? ' fmi-hovered' : ''}`}
            style={{ paddingLeft: indent }}
            onClick={onClick}
            title={image.name}
        >
            <span className="fmi-accent" style={{ background: image.folderColor }} />
            <span className="fmi-icon">{typeIcon}</span>
            <span className="fmi-name">{image.name}</span>
        </div>
    )
})

// ──────────────────────────────────────────────────────────────────────────────
//  VIRTUAL FOLDER NODE (recursive, only renders for sub-folders)
// ──────────────────────────────────────────────────────────────────────────────
interface VNodeProps {
    node: VNode
    depth: number
    folderColor: string
    expandedPaths: Set<string>
    onToggle: (path: string) => void
    selectedImageId: string | null
    hoveredImageId: string | null
    onImageClick: (img: ImageData) => void
    onFocus: (path: string) => void
    focusedPath: string | null  // currently focused path in this root folder, or null
}

const VFolderNode: React.FC<VNodeProps> = React.memo((
    { node, depth, folderColor, expandedPaths, onToggle,
      selectedImageId, hoveredImageId, onImageClick, onFocus, focusedPath }
) => {
    const isExpanded = expandedPaths.has(node.path)
    const total = countImages(node)
    const indent = depth * 14
    const hasChildren = node.children.length > 0 || node.images.length > 0
    const isFocused = focusedPath === node.path

    // Root sticky header (.fmf-header) is ~35px tall. 
    // Sub-folder headers are ~25px tall.
    // depth 1 -> sticks just below root header (at 35px)
    // depth 2 -> sticks below depth 1 (at 35 + 25 = 60px)
    const stickyTop = 35 + ((depth - 1) * 25)

    return (
        <div className="fmf-block">
            {/* sub-folder header — click row = focus map, click chevron = expand/collapse only */}
            <div
                className={`img-subfolder-header${isFocused ? ' img-subfolder-focused' : ''}`}
                style={{ 
                    paddingLeft: indent, 
                    cursor: 'pointer',
                    position: 'sticky',
                    top: stickyTop,
                    zIndex: 10 - depth // ensure deeper headers slide under shallower ones
                }}
                onClick={() => {
                    onFocus(node.path)      // filter map to this subfolder
                    onToggle(node.path)     // also auto-expand so user can see contents
                }}
                title={`${node.name} — click to show only these images on map`}
            >
                <span
                    className={`fmf-chevron${isExpanded ? ' open' : ''}`}
                    style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                    onClick={(e) => {
                        e.stopPropagation()  // chevron: expand/collapse only, don't focus
                        onToggle(node.path)
                    }}
                >›</span>
                <span className="img-subfolder-icon">📁</span>
                <span className="img-subfolder-name">{node.name}</span>
                <span className="fmf-count">{total}</span>
            </div>

            {isExpanded && (
                <>
                    {/* sub-sub-folders first */}
                    {node.children.map(child => (
                        <VFolderNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            folderColor={folderColor}
                            expandedPaths={expandedPaths}
                            onToggle={onToggle}
                            selectedImageId={selectedImageId}
                            hoveredImageId={hoveredImageId}
                            onImageClick={onImageClick}
                            onFocus={onFocus}
                            focusedPath={focusedPath}
                        />
                    ))}
                    {/* images in this folder */}
                    {node.images.map(img => (
                        <ImageRow
                            key={img.id}
                            image={img}
                            isSelected={img.id === selectedImageId}
                            isHovered={img.id === hoveredImageId}
                            depth={depth + 1}
                            onClick={() => onImageClick(img)}
                        />
                    ))}
                </>
            )}
        </div>
    )
})

// ──────────────────────────────────────────────────────────────────────────────
//  ROOT FOLDER BLOCK (the top-level upload folder)
// ──────────────────────────────────────────────────────────────────────────────
interface FolderBlockProps {
    folder: FolderData
    isExpanded: boolean
    onToggle: () => void
    onDelete: () => void
    selectedImageId: string | null
    hoveredImageId: string | null
    onImageClick: (img: ImageData) => void
    focusedSubFolder: { folderId: string; subPath: string | null } | null
    onFocusSubFolder: (folderId: string, subPath: string | null) => void
}

const FolderBlock: React.FC<FolderBlockProps> = React.memo((
    { folder, isExpanded, onToggle, onDelete,
      selectedImageId, hoveredImageId, onImageClick,
      focusedSubFolder, onFocusSubFolder }
) => {
    // Build the sub-tree fresh when images change (useMemo prevents rebuild on every render)
    const tree = useMemo(() => buildTree(folder.images), [folder.images])

    // Local expand state for sub-folders within this root
    const [subExpanded, setSubExpanded] = useState<Set<string>>(new Set())
    const toggleSub = useCallback((path: string) => {
        setSubExpanded(prev => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path); else next.add(path)
            return next
        })
    }, [])

    // Auto-expand subfolders if a hovered/selected image is inside them
    useEffect(() => {
        const activeId = hoveredImageId || selectedImageId
        if (!activeId) return

        const activeImg = folder.images.find(i => i.id === activeId)
        if (!activeImg || !activeImg.subFolderPath) return

        setSubExpanded(prev => {
            let changed = false
            const next = new Set(prev)
            let pathSoFar = ''
            for (const seg of activeImg.subFolderPath.split('/')) {
                pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg
                if (!next.has(pathSoFar)) {
                    next.add(pathSoFar)
                    changed = true
                }
            }
            return changed ? next : prev
        })
    }, [hoveredImageId, selectedImageId, folder.images])

    // What's focused inside THIS folder (if anything)
    const focusedPath = focusedSubFolder?.folderId === folder.id
        ? focusedSubFolder.subPath  // null=whole folder, string=subfolder
        : undefined  // undefined=no focus set for this folder

    const hasActive = folder.images.some(
        i => i.id === selectedImageId || i.id === hoveredImageId
    )
    const hasSubFolders = tree.children.length > 0
    // Root is "focused" when focusedPath===null (whole folder) but focus is set for this folder
    const rootFocused = focusedSubFolder?.folderId === folder.id && focusedPath === null

    return (
        <div className="fmf-block">
            {/* Sticky root-folder header */}
            <div className={`fmf-header${hasActive ? ' fmf-header-active' : ''}${rootFocused ? ' fmf-header-focused' : ''}`}>
                <div className="fmf-header-left" onClick={onToggle}
                    title={`${folder.name} — ${folder.images.length} images (click name to show all on map)`}>
                    <span className={`fmf-chevron${isExpanded ? ' open' : ''}`}>›</span>
                    <span className="fmf-dot" style={{ background: folder.color, boxShadow: `0 0 5px ${folder.color}99` }} />
                    <span className="fmf-name"
                        onClick={(e) => { e.stopPropagation(); onFocusSubFolder(folder.id, null) }}
                        style={{ cursor: 'pointer' }}
                        title="Show all images in this folder on map"
                    >{folder.name}</span>
                    <span className="fmf-count">{folder.images.length}</span>
                </div>
                <button className="fmf-delete-btn"
                    onClick={(e) => { e.stopPropagation(); onDelete() }}
                    title="Remove folder">✕</button>
            </div>

            {isExpanded && (
                <div className="fmf-list">
                    {folder.images.length === 0 ? (
                        <div className="fmf-empty">No geotagged images</div>
                    ) : (
                        <>
                            {/* Sub-folder tree */}
                            {hasSubFolders && tree.children.map(child => (
                                <VFolderNode
                                    key={child.path}
                                    node={child}
                                    depth={1}
                                    folderColor={folder.color}
                                    expandedPaths={subExpanded}
                                    onToggle={toggleSub}
                                    selectedImageId={selectedImageId}
                                    hoveredImageId={hoveredImageId}
                                    onImageClick={onImageClick}
                                    onFocus={(path) => onFocusSubFolder(folder.id, path)}
                                    focusedPath={typeof focusedPath === 'string' ? focusedPath : null}
                                />
                            ))}
                            {/* Images directly in root (no sub-folder) */}
                            {tree.images.map(img => (
                                <ImageRow
                                    key={img.id}
                                    image={img}
                                    isSelected={img.id === selectedImageId}
                                    isHovered={img.id === hoveredImageId}
                                    depth={1}
                                    onClick={() => onImageClick(img)}
                                />
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    )
})

// ──────────────────────────────────────────────────────────────────────────────
//  KML SECTION (unchanged — kept from previous session)
// ──────────────────────────────────────────────────────────────────────────────
function geomIcon(type: KmlPlacemark['geometryType']): string {
    switch (type) {
        case 'Point': return '📍'
        case 'LineString': return '〰️'
        case 'Polygon': return '⬡'
        case 'MultiGeometry': return '🗂'
        default: return '📌'
    }
}

interface KmlPlacemarkRowProps {
    pm: KmlPlacemark
    color: string
    depth: number
    onSelect: (pm: KmlPlacemark) => void
}

const KmlPlacemarkRow: React.FC<KmlPlacemarkRowProps> = React.memo(({ pm, color, depth, onSelect }) => {
    const isHovered = useStore(s => s.hoveredKmlPlacemarkId === pm.id)
    const isSelected = useStore(s => s.selectedKmlPlacemarkId === pm.id)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (isHovered && ref.current) ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, [isHovered])

    return (
        <div
            ref={ref}
            className={`kml-pm-row${isSelected ? ' kml-pm-selected' : ''}${isHovered ? ' kml-pm-hovered' : ''}`}
            style={{ paddingLeft: depth * 14 + 8, cursor: 'pointer' }}
            onClick={() => onSelect(pm)}
            title={pm.description ?? pm.name}
        >
            <span className="kml-pm-icon">{geomIcon(pm.geometryType)}</span>
            <span className="kml-pm-name">{pm.name}</span>
            <span className="kml-pm-dot" style={{ background: color }} />
        </div>
    )
})

interface KmlFolderNodeProps {
    folder: KmlFolder
    layerColor: string
    depth: number
    expandedFolders: Set<string>
    onToggle: (id: string) => void
    onSelectPlacemark: (pm: KmlPlacemark) => void
    onSelectFolder: (folder: KmlFolder) => void
}

const KmlFolderNode: React.FC<KmlFolderNodeProps> = React.memo(({
    folder, layerColor, depth, expandedFolders, onToggle, onSelectPlacemark, onSelectFolder
}) => {
    const isExpanded = expandedFolders.has(folder.id)
    const hasChildren = folder.children.length > 0 || folder.placemarks.length > 0

    return (
        <div className="kml-folder-node">
            <div
                className={`kml-folder-header${isExpanded ? ' open' : ''}`}
                style={{ paddingLeft: depth * 14 + 4 }}
            >
                <span
                    className={`fmf-chevron${isExpanded ? ' open' : ''}`}
                    style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                    onClick={() => onToggle(folder.id)}
                >›</span>
                <span className="kml-folder-icon" onClick={() => onSelectFolder(folder)} style={{ cursor: 'pointer' }}>📁</span>
                <span className="kml-folder-name" onClick={() => onSelectFolder(folder)} style={{ cursor: 'pointer' }}>{folder.name}</span>
                <span className="fmf-count">
                    {folder.placemarks.length + folder.children.reduce((s, c) => s + c.placemarks.length, 0)}
                </span>
            </div>

            {isExpanded && (
                <div className="kml-folder-children">
                    {folder.children.map(child => (
                        <KmlFolderNode
                            key={child.id}
                            folder={child}
                            layerColor={layerColor}
                            depth={depth + 1}
                            expandedFolders={expandedFolders}
                            onToggle={onToggle}
                            onSelectPlacemark={onSelectPlacemark}
                            onSelectFolder={onSelectFolder}
                        />
                    ))}
                    {folder.placemarks.map(pm => (
                        <KmlPlacemarkRow
                            key={pm.id}
                            pm={pm}
                            color={layerColor}
                            depth={depth + 1}
                            onSelect={onSelectPlacemark}
                        />
                    ))}
                </div>
            )}
        </div>
    )
})

interface KmlLayerBlockProps {
    layer: KmlLayer
    expandedFolders: Set<string>
    onToggleFolder: (id: string) => void
    onToggleVisible: () => void
    onDelete: () => void
    onSelectPlacemark: (pm: KmlPlacemark) => void
    onSelectFolder: (folder: KmlFolder) => void
}

const KmlLayerBlock: React.FC<KmlLayerBlockProps> = React.memo(({
    layer, expandedFolders, onToggleFolder, onToggleVisible, onDelete, onSelectPlacemark, onSelectFolder
}) => {
    const rootExpanded = expandedFolders.has(layer.rootFolder.id)

    function countPm(f: KmlFolder): number {
        return f.placemarks.length + f.children.reduce((s, c) => s + countPm(c), 0)
    }
    const total = countPm(layer.rootFolder)

    return (
        <div className={`kml-layer-block${layer.visible ? '' : ' kml-layer-hidden'}`}>
            <div className="kml-layer-header">
                <div
                    className="kml-layer-header-left"
                    title={layer.fileName}
                    onClick={() => onSelectFolder(layer.rootFolder)}
                    style={{ cursor: 'pointer' }}
                >
                    <span
                        className={`fmf-chevron${rootExpanded ? ' open' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onToggleFolder(layer.rootFolder.id) }}
                        style={{ cursor: 'pointer' }}
                    >›</span>
                    <span className="kml-layer-dot" style={{ background: layer.color, boxShadow: `0 0 6px ${layer.color}99` }} />
                    <span className="kml-layer-name">{layer.rootFolder.name}</span>
                    <span className="kml-layer-badge">KML</span>
                    <span className="fmf-count">{total}</span>
                </div>
                <div className="kml-layer-actions">
                    <button
                        className={`kml-vis-btn${layer.visible ? ' active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onToggleVisible() }}
                        title={layer.visible ? 'Hide layer' : 'Show layer'}
                    >
                        {layer.visible ? '👁' : '🚫'}
                    </button>
                    <button
                        className="fmf-delete-btn"
                        onClick={(e) => { e.stopPropagation(); onDelete() }}
                        title="Remove KML layer"
                    >✕</button>
                </div>
            </div>

            {rootExpanded && (
                <div className="kml-layer-tree">
                    {layer.rootFolder.placemarks.map(pm => (
                        <KmlPlacemarkRow key={pm.id} pm={pm} color={layer.color} depth={1} onSelect={onSelectPlacemark} />
                    ))}
                    {layer.rootFolder.children.map(child => (
                        <KmlFolderNode
                            key={child.id}
                            folder={child}
                            layerColor={layer.color}
                            depth={1}
                            expandedFolders={expandedFolders}
                            onToggle={onToggleFolder}
                            onSelectPlacemark={onSelectPlacemark}
                            onSelectFolder={onSelectFolder}
                        />
                    ))}
                </div>
            )}
        </div>
    )
})

// ──────────────────────────────────────────────────────────────────────────────
//  MAIN FILE MANAGER
// ──────────────────────────────────────────────────────────────────────────────

const FileManager: React.FC = () => {
    const {
        folders,
        hoveredImages,
        selectedImage,
        setSelectedImage,
        setHoveredImage,
        setPendingCard,
        expandedFolders,
        toggleFolderExpanded,
        removeFolder,
        totalDistance,
        showPath,
        kmlLayers,
        kmlExpandedFolders,
        toggleKmlFolderExpanded,
        toggleKmlLayerVisible,
        removeKmlLayer,
        setSelectedKmlPlacemark,
        focusedSubFolder,
        setFocusedSubFolder,
    } = useStore()

    const [activeTab, setActiveTab] = useState<'images' | 'kml'>('images')
    const hoveredImage = hoveredImages[0] ?? null

    // Auto-expand root folder when an image is selected / hovered
    useEffect(() => {
        if (selectedImage && !expandedFolders.has(selectedImage.folderId)) {
            toggleFolderExpanded(selectedImage.folderId)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedImage?.folderId])

    useEffect(() => {
        if (hoveredImage && !expandedFolders.has(hoveredImage.folderId)) {
            toggleFolderExpanded(hoveredImage.folderId)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hoveredImage?.folderId])

    // Auto-switch tab when a KML feature is hovered on the map
    const hoveredKmlId = useStore(s => s.hoveredKmlPlacemarkId)
    useEffect(() => {
        if (hoveredKmlId) setActiveTab('kml')
    }, [hoveredKmlId])

    const totalImages = folders.reduce((s, f) => s + f.images.length, 0)

    const handleImageClick = useCallback((img: ImageData) => {
        setSelectedImage(img)
        setHoveredImage(img, { x: 390, y: 230 })
        setPendingCard(img)
    }, [setSelectedImage, setHoveredImage, setPendingCard])

    const handlePlacemarkSelect = useCallback((pm: KmlPlacemark) => {
        const b = placemarkBounds(pm)
        setSelectedKmlPlacemark(pm.id, b)
    }, [setSelectedKmlPlacemark])

    const handleFolderSelect = useCallback((folder: KmlFolder) => {
        const b = folderBounds(folder)
        setSelectedKmlPlacemark(null, b)
    }, [setSelectedKmlPlacemark])

    const hasImages = folders.length > 0
    const hasKml = kmlLayers.length > 0
    const hasAnything = hasImages || hasKml

    return (
        <aside className="file-manager">
            {/* Header */}
            <div className="fm-header">
                <div className="fm-header-title">
                    <span className="fm-header-icon">🗂</span>
                    <span>File Manager</span>
                </div>
                {hasAnything && (
                    <div className="fm-tabs">
                        <button
                            className={`fm-tab${activeTab === 'images' ? ' active' : ''}`}
                            onClick={() => setActiveTab('images')}
                        >
                            📷 Images {hasImages && <span className="fm-tab-count">{folders.length}</span>}
                        </button>
                        <button
                            className={`fm-tab${activeTab === 'kml' ? ' active' : ''}`}
                            onClick={() => setActiveTab('kml')}
                        >
                            🗺 KML {hasKml && <span className="fm-tab-count">{kmlLayers.length}</span>}
                        </button>
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="fm-scroll-body">
                {!hasAnything && (
                    <div className="fm-empty-state">
                        <div className="fm-empty-icon">📂</div>
                        <p className="fm-empty-title">No data loaded</p>
                        <p className="fm-empty-sub">
                            Use <strong>Add Folder</strong> for drone images,<br />
                            or <strong>Import KML</strong> for KML/KMZ files.
                        </p>
                    </div>
                )}

                {/* ── Image tab ── */}
                {hasAnything && activeTab === 'images' && (
                    <>
                        {!hasImages ? (
                            <div className="fm-empty-state fm-empty-small">
                                <div className="fm-empty-icon" style={{ fontSize: '1.6rem' }}>📷</div>
                                <p className="fm-empty-title">No image folders</p>
                                <p className="fm-empty-sub">Click <strong>Add Folder</strong> to load images.</p>
                            </div>
                        ) : (
                            folders.map(folder => (
                                <FolderBlock
                                    key={folder.id}
                                    folder={folder}
                                    isExpanded={expandedFolders.has(folder.id)}
                                    onToggle={() => toggleFolderExpanded(folder.id)}
                                    onDelete={() => removeFolder(folder.id)}
                                    selectedImageId={selectedImage?.id ?? null}
                                    hoveredImageId={hoveredImage?.id ?? null}
                                    onImageClick={handleImageClick}
                                    focusedSubFolder={focusedSubFolder}
                                    onFocusSubFolder={setFocusedSubFolder}
                                />
                            ))
                        )}
                    </>
                )}
y
                {/* ── KML tab ── */}
                {hasAnything && activeTab === 'kml' && (
                    <>
                        {!hasKml ? (
                            <div className="fm-empty-state fm-empty-small">
                                <div className="fm-empty-icon" style={{ fontSize: '1.6rem' }}>🗺</div>
                                <p className="fm-empty-title">No KML layers</p>
                                <p className="fm-empty-sub">Click <strong>Import KML</strong> to load KML/KMZ.</p>
                            </div>
                        ) : (
                            kmlLayers.map(layer => (
                                <KmlLayerBlock
                                    key={layer.id}
                                    layer={layer}
                                    expandedFolders={kmlExpandedFolders}
                                    onToggleFolder={toggleKmlFolderExpanded}
                                    onToggleVisible={() => toggleKmlLayerVisible(layer.id)}
                                    onDelete={() => removeKmlLayer(layer.id)}
                                    onSelectPlacemark={handlePlacemarkSelect}
                                    onSelectFolder={handleFolderSelect}
                                />
                            ))
                        )}
                    </>
                )}
            </div>

            {/* Stats bar */}
            {hasAnything && (
                <div className="fm-stats-bar">
                    <div className="fm-stat">
                        <span className="fm-stat-label">Images</span>
                        <span className="fm-stat-val">{totalImages}</span>
                    </div>
                    <div className="fm-stat">
                        <span className="fm-stat-label">Folders</span>
                        <span className="fm-stat-val">{folders.length}</span>
                    </div>
                    <div className="fm-stat">
                        <span className="fm-stat-label">KML</span>
                        <span className="fm-stat-val">{kmlLayers.length}</span>
                    </div>
                    <div className="fm-stat">
                        <span className="fm-stat-label">Path</span>
                        <span className="fm-stat-val">{showPath ? `${totalDistance.toFixed(1)} km` : '—'}</span>
                    </div>
                </div>
            )}
        </aside>
    )
}

export default FileManager
