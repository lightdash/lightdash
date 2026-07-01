const CHUNK_ERROR_MESSAGES = [
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'Failed to load module script',
    'Unable to preload CSS',
];

export const isChunkLoadError = (message: string): boolean => {
    const normalizedMessage = message.toLowerCase();
    return CHUNK_ERROR_MESSAGES.some((chunkErrorMessage) =>
        normalizedMessage.includes(chunkErrorMessage.toLowerCase()),
    );
};

export const isChunkLoadErrorObject = (error: unknown): boolean => {
    if (error instanceof Error) {
        return isChunkLoadError(error.message);
    }
    return false;
};
