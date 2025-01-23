import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyImageToClipboard } from './copyImageToClipboard';

describe('copyImageToClipboard', () => {
    beforeEach(() => {
        // Reset mocks before each test
        vi.resetAllMocks();

        // Mock navigator.clipboard
        Object.defineProperty(globalThis, 'navigator', {
            value: {
                clipboard: {
                    write: vi.fn(),
                },
            },
            configurable: true,
        });

        // Mock Image
        global.Image = class {
            src = '';

            onload: (() => void) | null = null;

            width = 100;

            height = 100;

            constructor() {
                // Simulate immediate onload for testing
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 0);
            }
        } as any;

        // Mock document and canvas
        global.document = {
            createElement: vi.fn().mockImplementation(() => ({
                width: 100,
                height: 100,
                getContext: vi.fn().mockReturnValue({
                    drawImage: vi.fn(),
                }),
                toBlob: vi.fn((callback) => {
                    callback(new Blob());
                }),
            })),
        } as any;

        // Mock ClipboardItem
        global.ClipboardItem = vi
            .fn()
            .mockImplementation((items) => ({ items })) as any;
    });

    it('should successfully copy image to clipboard', async () => {
        const base64Image = 'data:image/png;base64,testImageData';
        const clipboardWriteMock = vi.spyOn(navigator.clipboard, 'write');

        await expect(copyImageToClipboard(base64Image)).resolves.not.toThrow();

        expect(clipboardWriteMock).toHaveBeenCalledWith(expect.any(Array));
    });

    it('should throw an error if canvas context is null', async () => {
        const base64Image = 'data:image/png;base64,testImageData';

        // Mock getContext to return null
        (document.createElement as any).mockReturnValueOnce({
            width: 100,
            height: 100,
            getContext: vi.fn().mockReturnValue(null),
        });

        await expect(copyImageToClipboard(base64Image)).rejects.toThrow(
            'Could not get canvas context',
        );
    });

    it('should handle errors during clipboard write', async () => {
        const base64Image = 'data:image/png;base64,testImageData';

        // Mock clipboard write to throw an error
        vi.spyOn(navigator.clipboard, 'write').mockRejectedValue(
            new Error('Clipboard write failed'),
        );

        const consoleErrorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        await expect(copyImageToClipboard(base64Image)).rejects.toThrow(
            'Clipboard write failed',
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to copy image to clipboard: Clipboard write failed',
        );

        consoleErrorSpy.mockRestore();
    });
});
