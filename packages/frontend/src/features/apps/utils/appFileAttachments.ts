export const MAX_APP_FILE_SIZE = 10 * 1024 * 1024;

const ACCEPTED_IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
]);

export type AppFileValidationError = {
    title: string;
    subtitle: string;
};

export const isSupportedAppImage = (file: File): boolean =>
    ACCEPTED_IMAGE_TYPES.has(file.type);

export const getAppFileSizeError = (
    file: File,
): AppFileValidationError | null =>
    file.size > MAX_APP_FILE_SIZE
        ? {
              title: 'File too large',
              subtitle: `${file.name} exceeds the 10MB limit.`,
          }
        : null;

const isSupportedNonImageFile = async (file: File): Promise<boolean> => {
    try {
        const sample = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
        if (sample.length === 0) return false;
        if (
            sample[0] === 0x25 &&
            sample[1] === 0x50 &&
            sample[2] === 0x44 &&
            sample[3] === 0x46
        ) {
            return true;
        }
        if (sample.includes(0)) return false;
        new TextDecoder('utf-8', { fatal: true }).decode(sample, {
            stream: true,
        });
        return true;
    } catch {
        return false;
    }
};

export const getAppFileValidationError = async (
    file: File,
): Promise<AppFileValidationError | null> => {
    const sizeError = getAppFileSizeError(file);
    if (sizeError) return sizeError;
    if (!isSupportedAppImage(file) && !(await isSupportedNonImageFile(file))) {
        return {
            title: 'Unsupported file type',
            subtitle: `${file.name}: attach images (PNG, JPEG, GIF, WEBP), PDFs, or text-based files (JSON, CSV, Markdown, TWB, code, …).`,
        };
    }
    return null;
};
