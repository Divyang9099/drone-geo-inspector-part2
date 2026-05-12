import React, { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { formatTimestamp } from '../utils/geoUtils'
import type { ImageData } from '../types/ImageData'

type SortKey = keyof Pick<ImageData, 'name' | 'type' | 'subFolderPath' | 'latitude' | 'longitude' | 'altitude' | 'timestamp' | 'gimbalPitch' | 'gimbalYaw' | 'gimbalRoll'>

const COLS: { key: SortKey; label: string; width?: string }[] = [
    { key: 'name',          label: 'File Name' },
    { key: 'type',          label: 'Type',         width: '90px' },
    { key: 'subFolderPath', label: 'SubFolder',    width: '140px' },
    { key: 'latitude',      label: 'Latitude',     width: '110px' },
    { key: 'longitude',     label: 'Longitude',    width: '110px' },
    { key: 'altitude',      label: 'Alt (m)',      width: '80px' },
    { key: 'gimbalPitch',   label: 'Pitch (°)',    width: '90px' },
    { key: 'gimbalYaw',     label: 'Yaw (°)',      width: '90px' },
    { key: 'gimbalRoll',    label: 'Roll (°)',     width: '90px' },
    { key: 'timestamp',     label: 'Timestamp',    width: '170px' },
]

const MetadataModal: React.FC = () => {
    const { folders, setShowMetadataModal } = useStore()

    const [selectedFolderId, setSelectedFolderId] = useState<string | 'all'>('all')
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<SortKey | null>(null)
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

    const allImages = useMemo(() => folders.flatMap(f => f.images), [folders])

    const displayImages = useMemo(() => {
        let imgs = selectedFolderId === 'all'
            ? allImages
            : allImages.filter(i => i.folderId === selectedFolderId)

        if (search.trim()) {
            const q = search.toLowerCase()
            imgs = imgs.filter(i =>
                i.name.toLowerCase().includes(q) ||
                i.folderName.toLowerCase().includes(q) ||
                i.subFolderPath.toLowerCase().includes(q)
            )
        }

        if (sortKey) {
            imgs = [...imgs].sort((a, b) => {
                const av = String(a[sortKey] ?? '')
                const bv = String(b[sortKey] ?? '')
                const cmp = av.localeCompare(bv, undefined, { numeric: true })
                return sortDir === 'asc' ? cmp : -cmp
            })
        }
        return imgs
    }, [allImages, selectedFolderId, search, sortKey, sortDir])

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortKey(key); setSortDir('asc') }
    }

    const downloadCSV = (images: ImageData[], filename: string) => {
        const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
        const header = ['#', 'Folder', 'SubFolder', 'Name', 'Type', 'Latitude', 'Longitude', 'Altitude (m)', 'Gimbal Pitch (°)', 'Gimbal Yaw (°)', 'Gimbal Roll (°)', 'Timestamp']
        const rows = images.map((img, i) => [
            String(i + 1),
            img.folderName,
            img.subFolderPath || '',
            img.name,
            img.type,
            img.latitude.toFixed(7),
            img.longitude.toFixed(7),
            img.altitude.toFixed(2),
            img.gimbalPitch != null ? img.gimbalPitch.toFixed(1) : '',
            img.gimbalYaw   != null ? img.gimbalYaw.toFixed(1)   : '',
            img.gimbalRoll  != null ? img.gimbalRoll.toFixed(1)  : '',
            img.timestamp || '',
        ])
        const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }

    const handleExport = () => {
        if (selectedFolderId === 'all') {
            downloadCSV(displayImages, 'all_metadata.csv')
        } else {
            const folder = folders.find(f => f.id === selectedFolderId)
            downloadCSV(displayImages, `${folder?.name ?? 'folder'}_metadata.csv`)
        }
    }

    const sortIcon = (key: SortKey) => {
        if (sortKey !== key) return <span className="md-sort-icon neutral">⇅</span>
        return <span className="md-sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>
    }

    const selectedFolder = folders.find(f => f.id === selectedFolderId)

    return (
        <div
            className="md-overlay"
            onMouseDown={e => { if (e.target === e.currentTarget) setShowMetadataModal(false) }}
        >
            <div className="md-modal">

                {/* ── Header ── */}
                <div className="md-header">
                    <div className="md-header-left">
                        <div className="md-header-icon">📊</div>
                        <div>
                            <h2 className="md-title">Metadata Export</h2>
                            <p className="md-subtitle">
                                {allImages.length} images &nbsp;·&nbsp; {folders.length} folder{folders.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <div className="md-header-right">
                        <button className="md-export-btn" onClick={handleExport} title="Download as CSV">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Download CSV
                        </button>
                        <button className="md-close" onClick={() => setShowMetadataModal(false)} title="Close">✕</button>
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="md-body">

                    {/* Left: folder list */}
                    <div className="md-sidebar">
                        <p className="md-sidebar-label">Folders</p>

                        <button
                            className={`md-folder-item ${selectedFolderId === 'all' ? 'active' : ''}`}
                            onClick={() => setSelectedFolderId('all')}
                        >
                            <span className="md-folder-dot" style={{ background: 'var(--accent-blue)' }} />
                            <span className="md-folder-name">All Folders</span>
                            <span className="md-folder-badge">{allImages.length}</span>
                        </button>

                        {folders.map(folder => (
                            <button
                                key={folder.id}
                                className={`md-folder-item ${selectedFolderId === folder.id ? 'active' : ''}`}
                                onClick={() => setSelectedFolderId(folder.id)}
                            >
                                <span className="md-folder-dot" style={{ background: folder.color }} />
                                <span className="md-folder-name" title={folder.name}>{folder.name}</span>
                                <span className="md-folder-badge">{folder.images.length}</span>
                            </button>
                        ))}
                    </div>

                    {/* Right: content */}
                    <div className="md-content">

                        {/* Toolbar */}
                        <div className="md-toolbar">
                            <div className="md-search-wrap">
                                <svg className="md-search-icon" width="13" height="13" viewBox="0 0 24 24"
                                    fill="none" stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="m21 21-4.35-4.35" />
                                </svg>
                                <input
                                    className="md-search"
                                    placeholder="Search name, folder, subfolder…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                                {search && (
                                    <button className="md-search-clear" onClick={() => setSearch('')}>✕</button>
                                )}
                            </div>

                            <div className="md-toolbar-right">
                                {selectedFolderId !== 'all' && selectedFolder && (
                                    <span className="md-active-folder-pill" style={{ borderColor: selectedFolder.color }}>
                                        <span className="md-folder-dot" style={{ background: selectedFolder.color }} />
                                        {selectedFolder.name}
                                    </span>
                                )}
                                <span className="md-count-badge">
                                    {displayImages.length} image{displayImages.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="md-table-wrap">
                            <table className="md-table">
                                <thead>
                                    <tr>
                                        <th className="md-th md-th-num">#</th>
                                        {selectedFolderId === 'all' && (
                                            <th className="md-th" style={{ width: '130px' }}>Folder</th>
                                        )}
                                        {COLS.map(col => (
                                            <th
                                                key={col.key}
                                                className={`md-th md-th-sort ${sortKey === col.key ? 'is-sorted' : ''}`}
                                                style={col.width ? { width: col.width } : {}}
                                                onClick={() => handleSort(col.key)}
                                            >
                                                {col.label} {sortIcon(col.key)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayImages.length === 0 ? (
                                        <tr>
                                            <td colSpan={COLS.length + 2} className="md-empty">
                                                <span>🔍</span>
                                                <span>No images match your search</span>
                                            </td>
                                        </tr>
                                    ) : displayImages.map((img, i) => (
                                        <tr key={img.id} className="md-row">
                                            <td className="md-td md-td-num">{i + 1}</td>

                                            {selectedFolderId === 'all' && (
                                                <td className="md-td">
                                                    <span className="md-inline-folder">
                                                        <span className="md-folder-dot" style={{ background: img.folderColor }} />
                                                        <span className="md-inline-folder-name" title={img.folderName}>{img.folderName}</span>
                                                    </span>
                                                </td>
                                            )}

                                            <td className="md-td md-td-name" title={img.name}>{img.name}</td>

                                            <td className="md-td">
                                                <span className={`md-type-badge md-type-${img.type}`}>
                                                    {img.type === 'thermal' ? '🌡' : img.type === 'visual' ? '📷' : '❓'}
                                                    {' '}{img.type}
                                                </span>
                                            </td>

                                            <td className="md-td md-td-muted" title={img.subFolderPath || undefined}>
                                                {img.subFolderPath || <span className="md-dash">—</span>}
                                            </td>

                                            <td className="md-td md-td-mono">{img.latitude.toFixed(6)}</td>
                                            <td className="md-td md-td-mono">{img.longitude.toFixed(6)}</td>
                                            <td className="md-td md-td-mono">{img.altitude.toFixed(1)}</td>

                                            <td className="md-td md-td-mono md-td-gimbal">
                                                {img.gimbalPitch != null ? img.gimbalPitch.toFixed(1) : <span className="md-dash">—</span>}
                                            </td>
                                            <td className="md-td md-td-mono md-td-gimbal">
                                                {img.gimbalYaw != null ? img.gimbalYaw.toFixed(1) : <span className="md-dash">—</span>}
                                            </td>
                                            <td className="md-td md-td-mono md-td-gimbal">
                                                {img.gimbalRoll != null ? img.gimbalRoll.toFixed(1) : <span className="md-dash">—</span>}
                                            </td>

                                            <td className="md-td md-td-muted">
                                                {img.timestamp ? formatTimestamp(img.timestamp) : <span className="md-dash">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}

export default MetadataModal
