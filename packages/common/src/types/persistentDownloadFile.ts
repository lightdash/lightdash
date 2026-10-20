export enum PersistentDownloadFileAccessMode {
    AUTHENTICATED_CREATOR = 'authenticated_creator',
    AUTHENTICATED_PROJECT = 'authenticated_project',
    SIGNED = 'signed',
    LEGACY_PUBLIC = 'legacy_public',
}

/** Which bucket holds the object; the download path reads from the same one. */
export enum PersistentDownloadFileStorage {
    EXPORTS = 'exports',
    UPLOADS = 'uploads',
}
