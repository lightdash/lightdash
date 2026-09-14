import { describe, expect, it, vi } from 'vitest';
import {
    getAppFileValidationError,
    MAX_APP_FILE_SIZE,
} from './appFileAttachments';

const sampledFile = (name: string, bytes: number[], type = ''): File => {
    const file = new File([Uint8Array.from(bytes)], name, { type });
    vi.spyOn(file, 'slice').mockReturnValue({
        arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    } as Blob);
    return file;
};

describe('getAppFileValidationError', () => {
    it('accepts supported image types without inspecting their contents', async () => {
        const file = sampledFile('chart.png', [], 'image/png');

        await expect(getAppFileValidationError(file)).resolves.toBeNull();
        expect(file.slice).not.toHaveBeenCalled();
    });

    it('accepts a PDF by its signature', async () => {
        const file = sampledFile('report', [0x25, 0x50, 0x44, 0x46, 0x00]);

        await expect(getAppFileValidationError(file)).resolves.toBeNull();
    });

    it('accepts UTF-8 text regardless of extension or MIME type', async () => {
        const file = sampledFile('workbook.twb', [0x3c, 0x78, 0x6d, 0x6c]);

        await expect(getAppFileValidationError(file)).resolves.toBeNull();
    });

    it('rejects binary content', async () => {
        const file = sampledFile('archive.bin', [0x89, 0x00, 0xff]);

        await expect(getAppFileValidationError(file)).resolves.toMatchObject({
            title: 'Unsupported file type',
        });
    });

    it('rejects files over 10MB before reading them', async () => {
        const file = sampledFile('huge.png', [0x78], 'image/png');
        Object.defineProperty(file, 'size', {
            value: MAX_APP_FILE_SIZE + 1,
        });

        await expect(getAppFileValidationError(file)).resolves.toMatchObject({
            title: 'File too large',
        });
        expect(file.slice).not.toHaveBeenCalled();
    });
});
