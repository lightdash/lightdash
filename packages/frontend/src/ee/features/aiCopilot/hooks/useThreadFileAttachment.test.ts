import { AI_THREAD_IMAGE_MAX_BYTES } from '@lightdash/common';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { type LightdashApiProps } from '../../../../api';
import {
    useThreadFileAttachment,
    type ThreadFileAttachment,
} from './useThreadFileAttachment';

const mocks = vi.hoisted(() => {
    const config: { enabled: boolean | undefined; embedded: boolean } = {
        enabled: true,
        embedded: false,
    };
    return {
        config,
        api: vi.fn<(props: LightdashApiProps) => Promise<unknown>>(),
        normalize: vi.fn<(file: File) => Promise<File>>(),
        toast: vi.fn(),
        toastApi: vi.fn(),
        createUrl: vi.fn<(file: Blob | MediaSource) => string>(),
        revokeUrl: vi.fn<(url: string) => void>(),
    };
});
vi.mock('../../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => mocks.api,
}));
vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastError: mocks.toast,
        showToastApiError: mocks.toastApi,
    }),
}));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.config.enabled } }),
}));
vi.mock('../../../providers/Embed/useIsEmbedded', () => ({
    default: () => mocks.config.embedded,
}));
vi.mock('./normalizeThreadImage', () => ({
    normalizeThreadImage: mocks.normalize,
}));
const image = (name = 'chart.png', size = 100) =>
    new File([new Uint8Array(size)], name, { type: 'image/png' });
const uploaded = (uuid: string, sizeBytes = 100, fileName = 'chart.png') => ({
    kind: 'image',
    uuid,
    fileName,
    sizeBytes,
    threadUuid: null,
    promptUuid: null,
    createdAt: '2026-10-29T12:00:00.000Z',
    expiresAt: '2026-11-28T12:00:00.000Z',
    width: 800,
    height: 400,
    mediaType: 'image/png',
});
const deferred = <T>() => {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((complete) => {
        resolve = complete;
    });
    return { promise, resolve };
};
beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.enabled = true;
    mocks.config.embedded = false;
    mocks.normalize.mockImplementation(async (file) => file);
    let nextId = 0;
    let nextUrl = 0;
    mocks.createUrl.mockImplementation(() => {
        nextUrl += 1;
        return `blob:preview-${nextUrl}`;
    });
    mocks.api.mockImplementation(async ({ method, body, url }) => {
        if (method === 'DELETE') return undefined;
        if (!(body instanceof File))
            throw new Error('Expected a binary File body');
        nextId += 1;
        const result = uploaded(`file-${nextId}`, body.size, body.name);
        return url.includes('/images?') ? result : { ...result, kind: 'text' };
    });
    vi.stubGlobal(
        'URL',
        class extends URL {
            static createObjectURL = mocks.createUrl;
            static revokeObjectURL = mocks.revokeUrl;
        },
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
const render = () => {
    const onReady = vi.fn<(attachment: ThreadFileAttachment) => void>();
    return {
        ...renderHook(() => useThreadFileAttachment({ onReady })),
        onReady,
    };
};

test('images upload as private binary, wire dates are ISO strings, and retain does not revoke the preview', async () => {
    const { result, onReady, unmount } = render();
    const file = image();
    await act(async () => {
        await result.current.attachImages([file]);
    });
    expect(mocks.api).toHaveBeenCalledWith(
        expect.objectContaining({
            method: 'POST',
            body: file,
            sensitive: true,
            url: '/aiAgents/thread-files/images?filename=chart.png',
            headers: { 'Content-Type': 'application/octet-stream' },
        }),
    );
    expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({
            type: 'thread_image',
            fileUuid: 'file-1',
            width: 800,
            height: 400,
            expiresAt: '2026-11-28T12:00:00.000Z',
            previewUrl: expect.stringContaining('blob:'),
        }),
    );
    act(() => {
        result.current.retainFiles(['file-1']);
    });
    expect(mocks.revokeUrl).not.toHaveBeenCalled();
    act(() => {
        result.current.clearPreviews(['file-1']);
    });
    expect(mocks.revokeUrl).toHaveBeenCalledOnce();
    unmount();
    expect(
        mocks.api.mock.calls.filter(([request]) => request.method === 'DELETE'),
    ).toHaveLength(0);
    expect(mocks.revokeUrl).toHaveBeenCalledOnce();
});

test.each([
    { enabled: false, embedded: false },
    { enabled: undefined, embedded: false },
    { enabled: true, embedded: true },
])(
    'flag-off, unresolved and embedded inputs do not prepare or upload images: %j',
    async ({ enabled, embedded }) => {
        mocks.config.enabled = enabled;
        mocks.config.embedded = embedded;
        const { result } = render();
        await act(async () => {
            await result.current.attachImages([image()]);
        });
        expect(result.current.imagesEnabled).toBe(false);
        expect(mocks.normalize).not.toHaveBeenCalled();
        expect(mocks.api).not.toHaveBeenCalled();
        expect(mocks.toast).toHaveBeenCalledWith({
            title: 'Image attachments are not enabled here',
        });
    },
);

test('documents retain their endpoint and size cap, with sensitive network-history recording', async () => {
    mocks.config.enabled = false;
    const { result, onReady } = render();
    const file = new File(['notes'], 'notes.txt');
    await act(async () => {
        await result.current.attachFiles([file]);
    });

    expect(onReady).toHaveBeenCalledWith({
        type: 'thread_file',
        fileUuid: 'file-1',
        fileName: 'notes.txt',
        sizeBytes: 5,
    });
    await act(async () => {
        await result.current.attachFiles([
            new File([new Uint8Array(1024 * 1024 + 1)], 'large.txt'),
        ]);
    });
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            url: '/aiAgents/thread-files?filename=notes.txt',
            body: file,
            sensitive: true,
        }),
    );
    expect(mocks.normalize).not.toHaveBeenCalled();
});

test('text uploads from previous-release pods do not require a kind discriminator', async () => {
    mocks.api.mockResolvedValueOnce({
        uuid: 'legacy-text',
        fileName: 'notes.txt',
        sizeBytes: 5,
    });
    const { result, onReady } = render();
    await act(async () => {
        await result.current.attachFiles([new File(['notes'], 'notes.txt')]);
    });
    expect(onReady).toHaveBeenCalledExactlyOnceWith({
        type: 'thread_file',
        fileUuid: 'legacy-text',
        fileName: 'notes.txt',
        sizeBytes: 5,
    });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toastApi).not.toHaveBeenCalled();
});

test('image responses without the image discriminator are rejected and disposed', async () => {
    mocks.api.mockResolvedValueOnce({
        uuid: 'wrong-image',
        fileName: 'chart.png',
        sizeBytes: 100,
    });
    const { result, onReady } = render();
    await act(async () => {
        await result.current.attachImages([image()]);
    });
    expect(onReady).not.toHaveBeenCalled();
    expect(mocks.createUrl).not.toHaveBeenCalled();
    expect(mocks.api).toHaveBeenLastCalledWith(
        expect.objectContaining({
            method: 'DELETE',
            url: '/aiAgents/thread-files/wrong-image',
        }),
    );
    expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
            subtitle: expect.stringContaining('unexpected attachment type'),
        }),
    );
});

test('five slots are reserved across calls before preparation and decoding stays serialized', async () => {
    const first = deferred<File>();
    mocks.normalize.mockReturnValueOnce(first.promise);
    const { result, onReady } = render();
    let tasks: Promise<void>[] = [];
    act(() => {
        tasks = [
            result.current.attachImages([
                image('1'),
                image('2'),
                image('3'),
                image('4'),
            ]),
            result.current.attachImages([image('5'), image('6')]),
        ];
    });
    expect(result.current.pendingFiles).toHaveLength(5);
    await waitFor(() => expect(mocks.normalize).toHaveBeenCalledOnce());
    expect(mocks.api).not.toHaveBeenCalled();
    await act(async () => {
        first.resolve(image('1'));
        await Promise.all(tasks);
    });
    expect(onReady).toHaveBeenCalledTimes(5);
    expect(mocks.normalize).toHaveBeenCalledTimes(5);
    await act(async () => {
        await result.current.attachImages([image('7')]);
    });
    expect(mocks.normalize).toHaveBeenCalledTimes(5);
    expect(mocks.toast).toHaveBeenCalled();
});

test('the byte budget settles on normalized images, not larger originals', async () => {
    mocks.normalize.mockImplementation(async (file) =>
        image(file.name, AI_THREAD_IMAGE_MAX_BYTES),
    );
    const { result, onReady } = render();
    await act(async () => {
        await result.current.attachImages([
            image('1', 6 * 1024 * 1024),
            image('2', 6 * 1024 * 1024),
        ]);
    });
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(
        mocks.api.mock.calls.every(
            ([request]) =>
                request.body instanceof File &&
                request.body.size === AI_THREAD_IMAGE_MAX_BYTES,
        ),
    ).toBe(true);
});

test('the overflowing fifth 3-MiB normalized image is rejected before upload', async () => {
    const { result, onReady } = render();
    await act(async () => {
        await result.current.attachImages(
            Array.from({ length: 5 }, (_, index) =>
                image(`${index}.png`, AI_THREAD_IMAGE_MAX_BYTES),
            ),
        );
    });
    expect(onReady).toHaveBeenCalledTimes(4);
    expect(mocks.api).toHaveBeenCalledTimes(4);
    expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
            subtitle: expect.stringContaining('12 MiB'),
        }),
    );
});

test('authoritative server size growth is checked again; the overflow upload is disposed', async () => {
    const requests = Array.from({ length: 5 }, () => deferred<unknown>());
    let index = 0;
    mocks.api.mockImplementation(async ({ method }) => {
        if (method === 'DELETE') return undefined;
        const pending = requests[index];
        index += 1;
        if (!pending) throw new Error('Unexpected upload');
        return pending.promise;
    });
    const { result, onReady } = render();
    let task = Promise.resolve();
    act(() => {
        task = result.current.attachImages(
            Array.from({ length: 5 }, (_, id) => image(`${id}`, 1024 * 1024)),
        );
    });
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(5));
    await act(async () => {
        requests.forEach((pending, id) =>
            pending.resolve(
                uploaded(`server-${id}`, AI_THREAD_IMAGE_MAX_BYTES),
            ),
        );
        await task;
    });
    expect(onReady).toHaveBeenCalledTimes(4);
    expect(
        mocks.api.mock.calls.filter(([request]) => request.method === 'DELETE'),
    ).toHaveLength(1);
    expect(mocks.createUrl).toHaveBeenCalledTimes(4);
});

test('cancellation during normalization frees the slot and never uploads or creates a preview', async () => {
    const preparation = deferred<File>();
    mocks.normalize.mockReturnValueOnce(preparation.promise);
    const { result, onReady } = render();
    let task = Promise.resolve();
    act(() => {
        task = result.current.attachImages([image()]);
    });
    await waitFor(() => expect(mocks.normalize).toHaveBeenCalledOnce());
    const pending = result.current.pendingFiles[0];
    if (!pending) throw new Error('Expected a reserved image slot');
    act(() => {
        result.current.cancelPendingFile(pending.id);
    });
    expect(result.current.isUploading).toBe(false);
    await act(async () => {
        preparation.resolve(image());
        await task;
    });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    expect(mocks.createUrl).not.toHaveBeenCalled();
});

test('late upload success after unmount is deleted rather than attached', async () => {
    const upload = deferred<unknown>();
    mocks.api.mockReturnValueOnce(upload.promise);
    const { result, onReady, unmount } = render();
    let task = Promise.resolve();
    act(() => {
        task = result.current.attachImages([image()]);
    });
    await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
    const request = mocks.api.mock.calls[0]?.[0];
    unmount();
    expect(request?.signal?.aborted).toBe(true);
    await act(async () => {
        upload.resolve(uploaded('late'));
        await task;
    });
    expect(onReady).not.toHaveBeenCalled();
    expect(mocks.api).toHaveBeenLastCalledWith(
        expect.objectContaining({
            method: 'DELETE',
            url: '/aiAgents/thread-files/late',
        }),
    );
    expect(mocks.createUrl).not.toHaveBeenCalled();
});

test('failed upload clears pending state without a preview or an orphan ownership entry', async () => {
    mocks.api.mockRejectedValueOnce(new Error('Upload failed'));
    const { result, unmount } = render();
    await act(async () => {
        await result.current.attachImages([image()]);
    });
    expect(result.current.pendingFiles).toHaveLength(0);
    expect(mocks.createUrl).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ subtitle: 'Upload failed' }),
    );
    unmount();
    expect(mocks.api).toHaveBeenCalledOnce();
});

test('remove revokes immediately and successful disposal is not repeated at unmount', async () => {
    const { result, unmount } = render();
    await act(async () => {
        await result.current.attachImages([image()]);
    });
    await act(async () => {
        await result.current.discardFile('file-1');
    });
    expect(mocks.revokeUrl).toHaveBeenCalledOnce();
    unmount();
    expect(mocks.revokeUrl).toHaveBeenCalledOnce();
    expect(
        mocks.api.mock.calls.filter(([request]) => request.method === 'DELETE'),
    ).toHaveLength(1);
});

test('a rejected claim releases ownership without revoking a usable draft preview', async () => {
    const { result, unmount } = render();
    await act(async () => {
        await result.current.attachImages([image()]);
    });
    act(() => {
        result.current.retainFiles(['file-1']);
        result.current.releaseFiles(['file-1']);
    });
    expect(mocks.revokeUrl).not.toHaveBeenCalled();
    expect(mocks.api).toHaveBeenCalledOnce();
    unmount();
    expect(mocks.revokeUrl).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenLastCalledWith(
        expect.objectContaining({
            method: 'DELETE',
            url: '/aiAgents/thread-files/file-1',
        }),
    );
});

test('a claim rejected after unmount is safely returned to disposable ownership', async () => {
    const { result, unmount } = render();
    await act(async () => {
        await result.current.attachImages([image()]);
    });
    const { retainFiles, releaseFiles } = result.current;
    retainFiles(['file-1']);
    unmount();
    releaseFiles(['file-1']);
    expect(mocks.api).toHaveBeenLastCalledWith(
        expect.objectContaining({
            method: 'DELETE',
            url: '/aiAgents/thread-files/file-1',
        }),
    );
});
