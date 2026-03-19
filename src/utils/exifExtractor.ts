import exifr from 'exifr'
import type { ImageData } from '../types/ImageData'
import type { FolderData } from '../types/FolderData'

function detectType(filename: string): ImageData['type'] {
    const base = filename.replace(/\.[^.]+$/, '')
    if (base.endsWith('_T')) return 'thermal'
    if (base.endsWith('_V')) return 'visual'
    return 'unknown'
}

async function extractSingle(
    file: File,
    folderId: string,
    folderName: string,
    folderColor: string,
    subFolderPath: string,
): Promise<Omit<ImageData, 'objectUrl'> | null> {
    try {
        const gps = await exifr.gps(file)
        if (!gps || gps.latitude == null || gps.longitude == null) return null

        let altitude = 0
        let timestamp: string | undefined

        try {
            const meta = await exifr.parse(file, {
                gps: true,
                translateValues: true,
                translateKeys: true,
                pick: ['GPSAltitude', 'DateTimeOriginal', 'CreateDate'],
            })
            if (meta?.GPSAltitude != null) altitude = meta.GPSAltitude
            const rawDate = meta?.DateTimeOriginal ?? meta?.CreateDate
            if (rawDate) {
                try { timestamp = new Date(rawDate).toISOString() } catch { /* skip */ }
            }
        } catch { /* skip */ }

        return {
            id: `${folderId}-${file.name}-${file.size}`,
            file,
            name: file.name,
            folderId,
            folderName,
            folderColor,
            latitude: gps.latitude,
            longitude: gps.longitude,
            altitude,
            timestamp,
            type: detectType(file.name),
            subFolderPath,
        }
    } catch {
        return null
    }
}

export async function processFolder(
    files: File[],
    folderId: string,
    folderName: string,
    folderColor: string,
    onProgress: (current: number, total: number) => void
): Promise<Omit<FolderData, 'uploadedAt'>> {
    const jpgFiles = files.filter((f) => /\.(jpg|jpeg)$/i.test(f.name))
    const results: ImageData[] = []
    let skipped = 0

    for (let i = 0; i < jpgFiles.length; i++) {
        const f = jpgFiles[i]
        // webkitRelativePath = 'root/sub1/sub2/file.jpg' → subFolderPath = 'sub1/sub2'
        const relPath: string = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name
        const parts = relPath.split('/')
        // parts[0] = root (= folderName), parts[last] = filename, middle = subfolders
        const subFolderPath = parts.length > 2 ? parts.slice(1, -1).join('/') : ''

        const raw = await extractSingle(f, folderId, folderName, folderColor, subFolderPath)
        if (raw) {
            results.push({ ...raw, objectUrl: URL.createObjectURL(raw.file) })
        } else {
            skipped++
        }
        onProgress(i + 1, jpgFiles.length)
        if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0))
    }

    return { id: folderId, name: folderName, color: folderColor, images: results, skipped }
}
