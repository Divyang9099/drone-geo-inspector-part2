import React, { useRef, useCallback } from 'react'
import { useStore, FOLDER_COLORS, KML_COLORS } from '../store/useStore'
import logoUrl from '../assets/favicon.png'
import { processFolder } from '../utils/exifExtractor'
import { parseKmlFile, extractKmlFromKmz } from '../utils/kmlParser'

const TopBar: React.FC = () => {
    const folderInputRef = useRef<HTMLInputElement>(null)
    const kmlInputRef = useRef<HTMLInputElement>(null)

    const {
        folders,
        filteredImages,
        filterType,
        setFilterType,
        addFolder,
        setLoading,
        setProgress,
        loading,
        showPath,
        togglePath,
        totalDistance,
        clearAll,
        progress,
        loadingFolderName,
        // KML
        kmlLayers,
        kmlLoading,
        kmlLoadingName,
        addKmlLayer,
        setKmlLoading,
        clearAllKml,
    } = useStore()

    const getNextFolderColor = useCallback(() => {
        return FOLDER_COLORS[folders.length % FOLDER_COLORS.length]
    }, [folders.length])

    const getNextKmlColor = useCallback(() => {
        return KML_COLORS[kmlLayers.length % KML_COLORS.length]
    }, [kmlLayers.length])

    // ── Image folder upload ──────────────────────────────────────
    const handleFolderSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files || [])
            if (files.length === 0) return

            const firstPath = files[0].webkitRelativePath || files[0].name
            const folderName = firstPath.split('/')[0] || `Folder ${folders.length + 1}`
            const folderId = `folder-${Date.now()}`
            const color = getNextFolderColor()

            setLoading(true, folderName)
            setProgress(0, files.length)

            const result = await processFolder(files, folderId, folderName, color, (cur, tot) =>
                setProgress(cur, tot)
            )

            addFolder({ ...result, uploadedAt: new Date().toISOString() })
            setLoading(false)

            if (folderInputRef.current) folderInputRef.current.value = ''
        },
        [folders.length, getNextFolderColor, addFolder, setLoading, setProgress]
    )

    // ── KML file upload ──────────────────────────────────────────
    const handleKmlSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files || [])
            if (files.length === 0) return

            for (const file of files) {
                try {
                    setKmlLoading(true, file.name)

                    // KMZ = ZIP containing a .kml file — extract it first
                    const isKmz = file.name.toLowerCase().endsWith('.kmz')
                    const text = isKmz
                        ? await extractKmlFromKmz(file)
                        : await file.text()

                    const color = getNextKmlColor()
                    const layer = parseKmlFile(text, file.name, color)
                    addKmlLayer(layer)
                } catch (err) {
                    console.error('KML/KMZ parse error:', err)
                    setKmlLoading(false)
                }
            }

            setKmlLoading(false)
            if (kmlInputRef.current) kmlInputRef.current.value = ''
        },
        [getNextKmlColor, addKmlLayer, setKmlLoading]
    )

    const totalImages = folders.reduce((s, f) => s + f.images.length, 0)
    const totalSkipped = folders.reduce((s, f) => s + f.skipped, 0)

    const isLoading = loading || kmlLoading
    const loadingName = loading ? loadingFolderName : kmlLoadingName

    const filters: Array<{ label: string; value: typeof filterType }> = [
        { label: 'All', value: 'all' },
        { label: '🌡 Thermal', value: 'thermal' },
        { label: '📷 Visual', value: 'visual' },
    ]

    return (
        <header className="topbar">
            {/* ── Brand ── */}
            <div className="topbar-left">
                <div className="brand">
                    <img src={logoUrl} alt="निरीक्षकः" className="brand-logo" />
                    <span className="brand-name">निरीक्षकः</span>
                </div>

                {/* Image folder upload */}
                <label className="btn-upload" htmlFor="folder-input" title="Add image folder to session">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add Folder
                </label>
                <input
                    ref={folderInputRef}
                    id="folder-input"
                    type="file"
                    // @ts-expect-error: webkitdirectory not in standard typings
                    webkitdirectory=""
                    multiple
                    accept=".jpg,.jpeg"
                    onChange={handleFolderSelect}
                    className="hidden"
                    disabled={isLoading}
                />

                {/* KML file upload */}
                <label className="btn-kml-upload" htmlFor="kml-input" title="Import KML file">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    Import KML
                </label>
                <input
                    ref={kmlInputRef}
                    id="kml-input"
                    type="file"
                    multiple
                    accept=".kml,.kmz"
                    onChange={handleKmlSelect}
                    className="hidden"
                    disabled={isLoading}
                />
            </div>

            {/* ── Center: progress or filters ── */}
            <div className="topbar-center">
                {isLoading ? (
                    <div className="progress-info">
                        <div className="spinner" />
                        <span>
                            Loading <strong>{loadingName}</strong>&nbsp;
                            {loading && `${progress.current} / ${progress.total}`}
                        </span>
                    </div>
                ) : (
                    <div className="filter-group">
                        {filters.map((f) => (
                            <button
                                key={f.value}
                                className={`filter-btn ${filterType === f.value ? 'active' : ''}`}
                                onClick={() => setFilterType(f.value)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Right: stats + actions ── */}
            <div className="topbar-right">
                <div className="stats-row">
                    <div className="stat-chip">
                        <span className="stat-label">Folders</span>
                        <span className="stat-value">{folders.length}</span>
                    </div>
                    <div className="stat-chip">
                        <span className="stat-label">Points</span>
                        <span className="stat-value">{filteredImages.length}</span>
                    </div>
                    <div className="stat-chip">
                        <span className="stat-label">Total</span>
                        <span className="stat-value">{totalImages}</span>
                    </div>
                    {kmlLayers.length > 0 && (
                        <div className="stat-chip kml-chip">
                            <span className="stat-label">KML</span>
                            <span className="stat-value">{kmlLayers.length}</span>
                        </div>
                    )}
                    <div className="stat-chip">
                        <span className="stat-label">Distance</span>
                        <span className="stat-value">{totalDistance.toFixed(2)} km</span>
                    </div>
                    {totalSkipped > 0 && (
                        <div className="stat-chip warn">
                            <span className="stat-label">Skipped</span>
                            <span className="stat-value">{totalSkipped}</span>
                        </div>
                    )}
                </div>

                {(folders.length > 0 || kmlLayers.length > 0) && (
                    <div className="action-row">
                        {folders.length > 0 && (
                            <button className={`btn-ghost ${showPath ? 'active' : ''}`} onClick={togglePath}>
                                {showPath ? '🛑 Hide Path' : '🗺 Path'}
                            </button>
                        )}
                        {folders.length > 0 && (
                            <button className="btn-danger" onClick={clearAll}>🗑 Clear Images</button>
                        )}
                        {kmlLayers.length > 0 && (
                            <button className="btn-danger" onClick={clearAllKml}>🗑 Clear KML</button>
                        )}
                    </div>
                )}
            </div>
        </header>
    )
}

export default TopBar
