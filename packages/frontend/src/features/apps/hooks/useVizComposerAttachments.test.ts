import { MAX_APP_FILES_PER_VERSION } from '@lightdash/common';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useAppFileUpload } from './useAppFileUpload';
import { useVizComposerAttachments } from './useVizComposerAttachments';

vi.mock('./useAppFileUpload', () => ({ useAppFileUpload: vi.fn() }));

const showToastError = vi.fn();
const showToastWarning = vi.fn();
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError, showToastWarning }),
}));

const mockedUpload = vi.mocked(useAppFileUpload);

const file = (name: string, size = 10, type = 'image/png'): File => {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
};

const setup = (uploadFile: ReturnType<typeof vi.fn>) => {
    mockedUpload.mockReturnValue({
        mutateAsync: uploadFile,
    } as unknown as ReturnType<typeof useAppFileUpload>);
    return renderHookWithProviders(() =>
        useVizComposerAttachments({
            projectUuid: 'project-1',
            appUuid: 'app-1',
        }),
    );
};

describe('useVizComposerAttachments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // jsdom has no object URL support.
        URL.createObjectURL = vi.fn((value) => `blob:${(value as File).name}`);
        URL.revokeObjectURL = vi.fn();
    });

    it('uploads on attach and carries the id once it lands', async () => {
        const uploadFile = vi.fn().mockResolvedValue({ fileId: 'f1' });
        const { result } = setup(uploadFile);

        act(() => result.current.add([file('chart.png')]));

        // Listed immediately, but not sendable until the upload lands: only
        // uploaded ids can travel with the request.
        expect(result.current.attachments).toHaveLength(1);
        expect(result.current.isUploading).toBe(true);
        expect(result.current.fileIds).toEqual([]);

        await waitFor(() => expect(result.current.fileIds).toEqual(['f1']));
        expect(result.current.isUploading).toBe(false);
        expect(uploadFile.mock.lastCall?.[0]).toMatchObject({
            projectUuid: 'project-1',
            appUuid: 'app-1',
        });
    });

    it('refuses a file over the size limit without uploading it', () => {
        const uploadFile = vi.fn();
        const { result } = setup(uploadFile);

        act(() => result.current.add([file('huge.png', 11 * 1024 * 1024)]));

        expect(result.current.attachments).toEqual([]);
        expect(uploadFile).not.toHaveBeenCalled();
        expect(showToastError).toHaveBeenCalledTimes(1);
    });

    it('refuses binary files the generator cannot attach', async () => {
        const uploadFile = vi.fn();
        const { result } = setup(uploadFile);
        const binary = new File(
            [new Uint8Array([0x89, 0x00, 0xff])],
            'archive.bin',
            { type: 'application/octet-stream' },
        );
        vi.spyOn(binary, 'slice').mockReturnValue({
            arrayBuffer: async () => Uint8Array.from([0x89, 0x00, 0xff]).buffer,
        } as Blob);

        act(() => result.current.add([binary]));

        expect(result.current.attachments).toEqual([]);
        expect(uploadFile).not.toHaveBeenCalled();
        await waitFor(() =>
            expect(showToastError).toHaveBeenCalledWith({
                title: 'Unsupported file type',
                subtitle:
                    'archive.bin: attach images (PNG, JPEG, GIF, WEBP), PDFs, or text-based files (JSON, CSV, Markdown, TWB, code, …).',
            }),
        );
    });

    it('takes what fits and warns once for a batch over the cap', () => {
        const uploadFile = vi.fn().mockResolvedValue({ fileId: 'f' });
        const { result } = setup(uploadFile);

        const batch = Array.from(
            { length: MAX_APP_FILES_PER_VERSION + 2 },
            (_, i) => file(`f${i}.png`),
        );
        act(() => result.current.add(batch));

        expect(result.current.attachments).toHaveLength(
            MAX_APP_FILES_PER_VERSION,
        );
        // One warning for the batch, not one per rejected file.
        expect(showToastWarning).toHaveBeenCalledTimes(1);
    });

    it('keeps an inspected file from racing past the attachment cap', async () => {
        const uploadFile = vi.fn().mockResolvedValue({ fileId: 'f' });
        const { result } = setup(uploadFile);
        let resolveSample: (value: ArrayBuffer) => void = () => undefined;
        const sample = new Promise<ArrayBuffer>((resolve) => {
            resolveSample = resolve;
        });
        const textFile = file('notes.txt', 10, 'text/plain');
        vi.spyOn(textFile, 'slice').mockReturnValue({
            arrayBuffer: () => sample,
        } as Blob);

        act(() => result.current.add([textFile]));
        act(() =>
            result.current.add(
                Array.from({ length: MAX_APP_FILES_PER_VERSION }, (_, i) =>
                    file(`image-${i}.png`),
                ),
            ),
        );
        resolveSample(Uint8Array.from([0x78]).buffer);

        await waitFor(() => expect(showToastWarning).toHaveBeenCalledTimes(1));
        expect(result.current.attachments).toHaveLength(
            MAX_APP_FILES_PER_VERSION,
        );
        expect(uploadFile).toHaveBeenCalledTimes(MAX_APP_FILES_PER_VERSION);
    });

    it('drops an attachment whose upload failed', async () => {
        const uploadFile = vi.fn().mockRejectedValue(new Error('nope'));
        const { result } = setup(uploadFile);

        act(() => result.current.add([file('chart.png')]));

        await waitFor(() => expect(result.current.attachments).toEqual([]));
        expect(showToastError).toHaveBeenCalledWith({
            title: 'Upload failed',
            subtitle: 'Please try again or contact support.',
        });
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:chart.png');
    });

    it('releases an image preview when its attachment is removed', async () => {
        const uploadFile = vi.fn().mockResolvedValue({ fileId: 'f1' });
        const { result } = setup(uploadFile);

        act(() => result.current.add([file('chart.png')]));
        await waitFor(() => expect(result.current.fileIds).toEqual(['f1']));
        act(() => result.current.remove('0'));

        expect(result.current.attachments).toEqual([]);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:chart.png');
    });

    it('releases every image preview when attachments are cleared', () => {
        const uploadFile = vi.fn().mockResolvedValue({ fileId: 'f1' });
        const { result } = setup(uploadFile);

        act(() => result.current.add([file('one.png'), file('two.png')]));
        act(() => result.current.clear());

        expect(result.current.attachments).toEqual([]);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:one.png');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:two.png');
    });

    it('releases image previews on unmount', () => {
        const uploadFile = vi.fn().mockResolvedValue({ fileId: 'f1' });
        const { result, unmount } = setup(uploadFile);

        act(() => result.current.add([file('chart.png')]));
        unmount();

        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:chart.png');
    });
});
