export interface ImageData {
    id: string
    file: File
    name: string
    folderId: string
    folderName: string
    folderColor: string
    latitude: number
    longitude: number
    altitude: number
    timestamp?: string
    type: 'thermal' | 'visual' | 'unknown'
    objectUrl?: string
    /** Path segments inside the root folder, joined with '/'. e.g. 'subfolder/deeper' or '' for root */
    subFolderPath: string
}
