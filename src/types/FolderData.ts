import type { ImageData } from './ImageData'

export interface FolderData {
    id: string
    name: string
    color: string
    images: ImageData[]
    uploadedAt: string
    skipped: number
}
