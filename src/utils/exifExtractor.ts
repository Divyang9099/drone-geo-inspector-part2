import exifr from 'exifr'
import type { ImageData } from '../types/ImageData'
import type { FolderData } from '../types/FolderData'

function detectType(filename: string): ImageData['type'] {
    const base = filename.replace(/\.[^.]+$/, '')
    if (base.endsWith('_T')) return 'thermal'
    if (base.endsWith('_V')) return 'visual'
    return 'unknown'
}

// ── DJI XMP extraction ────────────────────────────────────────────────────────
// DJI stores gimbal angles in the XMP block of each JPEG as attributes on
// rdf:Description, e.g.:
//   drone-dji:GimbalPitchDegree="-90.00"
// DOMParser namespace handling for attributes is unreliable across browsers,
// so we extract values with direct regex on the raw XMP string instead.

/** Locate the raw XMP XML text inside a JPEG binary. Two strategies are used. */
function findXmpInJpeg(bytes: Uint8Array): string | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    // ── Strategy 1: Walk JPEG APP markers ───────────────────────────────────
    // APP1 (0xFF 0xE1) that carries XMP has the namespace URI immediately after
    // the 4-byte marker+length header, followed by a null terminator.
    let offset = 2 // skip SOI (FF D8)
    while (offset < bytes.length - 4) {
        if (bytes[offset] !== 0xFF) break
        const marker = bytes[offset + 1]
        if (marker === 0xDA || marker === 0xD9) break // SOS / EOI

        // segLen includes its own 2 bytes
        const segLen = view.getUint16(offset + 2, false)

        if (marker === 0xE1 && segLen > 30) {
            // Decode just enough bytes to check the namespace URI header
            const headerSlice = bytes.slice(offset + 4, offset + 4 + 32)
            const headerText  = new TextDecoder('ascii', { fatal: false }).decode(headerSlice)

            if (headerText.startsWith('http://ns.adobe.com/xap/1.0/')) {
                // Skip past namespace URI + null terminator to reach the XML
                let xmlStart = offset + 4 + 28 // 28 = len of 'http://ns.adobe.com/xap/1.0/'
                while (xmlStart < offset + 4 + 64 && bytes[xmlStart] !== 0x3C /* '<' */) xmlStart++

                const xmlEnd = offset + 2 + segLen
                if (xmlEnd > xmlStart) {
                    return new TextDecoder('utf-8').decode(bytes.slice(xmlStart, xmlEnd))
                }
            }
        }

        offset += 2 + segLen
    }

    // ── Strategy 2: Text search in the first 128 KB ──────────────────────────
    // Handles edge cases where the marker scan doesn't find the XMP block
    // (e.g., DJI thermal RJPEG with unusual header padding).
    const head = new TextDecoder('utf-8', { fatal: false })
        .decode(bytes.slice(0, Math.min(bytes.length, 131072)))

    const begin = head.indexOf('<x:xmpmeta')
    if (begin !== -1) {
        const end = head.indexOf('</x:xmpmeta>', begin)
        return end !== -1 ? head.slice(begin, end + 12) : head.slice(begin)
    }

    // Last resort: look for raw xpacket
    const pkt = head.indexOf('<?xpacket begin')
    if (pkt !== -1) return head.slice(pkt)

    return null
}

/**
 * Extract a numeric DJI XMP field from the raw XML string.
 *
 * Handles all three storage patterns DJI uses:
 *   1. Attribute:  drone-dji:GimbalPitchDegree="-90.00"
 *   2. NS element: <drone-dji:GimbalPitchDegree>-90.00</drone-dji:GimbalPitchDegree>
 *   3. Plain tag:  <GimbalPitchDegree>-90.00</GimbalPitchDegree>
 */
function pickFromXmp(xmp: string, ...fields: string[]): number | undefined {
    for (const field of fields) {
        // 1. Attribute form  (most common on DJI H20T and newer models)
        const a = xmp.match(new RegExp(`${field}="([+-]?\\d+(?:\\.\\d+)?)"`, 'i'))
        if (a) { const v = parseFloat(a[1]); if (!isNaN(v)) return v }

        // 2. Namespaced element content
        const e = xmp.match(new RegExp(`:${field}>([+-]?\\d+(?:\\.\\d+)?)<`, 'i'))
        if (e) { const v = parseFloat(e[1]); if (!isNaN(v)) return v }

        // 3. Plain element content (no namespace prefix)
        const p = xmp.match(new RegExp(`<${field}>([+-]?\\d+(?:\\.\\d+)?)<`, 'i'))
        if (p) { const v = parseFloat(p[1]); if (!isNaN(v)) return v }
    }
    return undefined
}

async function extractDjiAngles(
    buffer: ArrayBuffer
): Promise<{ gimbalPitch?: number; gimbalYaw?: number; gimbalRoll?: number }> {
    try {
        const xmpXml = findXmpInJpeg(new Uint8Array(buffer))
        if (!xmpXml) return {}

        console.log('DJI metadata (XMP)', xmpXml.slice(0, 600))

        const gimbalPitch = pickFromXmp(xmpXml, 'GimbalPitchDegree', 'CameraPitch', 'Pitch')
        const gimbalYaw   = pickFromXmp(xmpXml, 'GimbalYawDegree',   'CameraYaw',   'Yaw')
        const gimbalRoll  = pickFromXmp(xmpXml, 'GimbalRollDegree',  'CameraRoll',  'Roll')

        console.log('Pitch', gimbalPitch)
        console.log('Yaw',   gimbalYaw)
        console.log('Roll',  gimbalRoll)

        return { gimbalPitch, gimbalYaw, gimbalRoll }
    } catch (err) {
        console.warn('extractDjiAngles failed:', err)
        return {}
    }
}

// ── Per-image extraction ──────────────────────────────────────────────────────

async function extractSingle(
    file: File,
    folderId: string,
    folderName: string,
    folderColor: string,
    subFolderPath: string,
): Promise<Omit<ImageData, 'objectUrl'> | null> {
    try {
        // Read once — shared by exifr (GPS/altitude/timestamp) and XMP scanner
        const buffer = await file.arrayBuffer()

        const gps = await exifr.gps(buffer)
        if (!gps || gps.latitude == null || gps.longitude == null) return null

        let altitude  = 0
        let timestamp: string | undefined

        try {
            const meta = await exifr.parse(buffer, {
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

        // Gimbal angles — raw XMP binary extraction, no exifr / EXIF library
        const { gimbalPitch, gimbalYaw, gimbalRoll } = await extractDjiAngles(buffer)

        return {
            id: `${folderId}-${file.name}-${file.size}`,
            file,
            name: file.name,
            folderId,
            folderName,
            folderColor,
            latitude:  gps.latitude,
            longitude: gps.longitude,
            altitude,
            timestamp,
            type: detectType(file.name),
            subFolderPath,
            gimbalPitch,
            gimbalYaw,
            gimbalRoll,
        }
    } catch {
        return null
    }
}

// ── Folder batch processor ────────────────────────────────────────────────────

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
