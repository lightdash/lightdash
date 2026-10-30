import {
    AI_THREAD_IMAGE_MAX_BYTES,
    NotFoundError,
    ParameterError,
    type AiPromptContext,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { type FileStorageClient } from '../../../clients/FileStorage/FileStorageClient';
import { type AiThreadFileWithContent } from '../../models/AiThreadFileModel';
import { resolveThreadImages } from './threadImageContext';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

const setup = async (uuid = 'image-1', promptUuid = 'prompt-1') => {
    const bytes = await sharp({
        create: { width: 2, height: 2, channels: 3, background: 'red' },
    })
        .png()
        .toBuffer();
    const file: Extract<AiThreadFileWithContent, { kind: 'image' }> = {
        kind: 'image',
        uuid,
        promptUuid,
        fileName: 'chart.png',
        threadUuid: 'thread-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        sizeBytes: bytes.length,
        width: 2,
        height: 2,
        mediaType: 'image/png',
        storageKey: `private/${uuid}.png`,
        uploadedAt: new Date(),
        objectDeletedAt: null,
    };
    const item: Extract<AiPromptContext[number], { type: 'thread_image' }> = {
        type: 'thread_image',
        fileUuid: uuid,
        fileName: file.fileName,
        width: file.width,
        height: file.height,
        mediaType: file.mediaType,
        sizeBytes: file.sizeBytes,
        expiresAt: file.expiresAt.toISOString(),
    };
    const contextMap = new Map<string, AiPromptContext>([[promptUuid, [item]]]);
    const storage = {
        getFileStream: vi
            .fn<FileStorageClient['getFileStream']>()
            .mockImplementation(async () => ({
                stream: Readable.from([bytes]),
                contentDisposition: null,
            })),
    };
    const read = () =>
        resolveThreadImages({ contextMap, files: [file], storage });
    return { bytes, file, item, contextMap, storage, read };
};

test('reads binary bytes into native model image parts', async () => {
    const { read, bytes, file, storage } = await setup();
    const images = await read();
    expect(images.get(file.uuid)).toEqual({
        status: 'available',
        part: {
            type: 'file',
            data: { type: 'data', data: bytes },
            mediaType: 'image/png',
        },
    });
    expect(storage.getFileStream).toHaveBeenCalledWith(file.storageKey, {
        abortSignal: expect.any(AbortSignal),
    });
});

test('does not read bytes for compacted-away image references', async () => {
    const first = await setup();
    const second = await setup('image-2', 'prompt-2');
    const images = await resolveThreadImages({
        contextMap: second.contextMap,
        files: [first.file, second.file],
        storage: second.storage,
    });
    expect([...images.keys()]).toEqual(['image-2']);
    expect(second.storage.getFileStream).toHaveBeenCalledExactlyOnceWith(
        second.file.storageKey,
        expect.anything(),
    );
});

test('retains both first-prompt and follow-up image identities', async () => {
    const first = await setup();
    const second = await setup('image-2', 'prompt-2');
    const images = await resolveThreadImages({
        contextMap: new Map([...first.contextMap, ...second.contextMap]),
        files: [first.file, second.file],
        storage: first.storage,
    });
    expect([...images.keys()]).toEqual(['image-1', 'image-2']);
    expect(first.storage.getFileStream).toHaveBeenCalledTimes(2);
});

test('snapshot expiry prevents storage reads even before asynchronous object deletion', async () => {
    const { read, item, storage } = await setup();
    item.expiresAt = '2000-01-01T00:00:00.000Z';
    expect((await read()).get(item.fileUuid)).toEqual({ status: 'expired' });
    expect(storage.getFileStream).not.toHaveBeenCalled();
});

test('authoritative ledger expiry also prevents storage reads', async () => {
    const { read, file, storage } = await setup();
    file.expiresAt = new Date(0);
    expect((await read()).get(file.uuid)).toEqual({ status: 'expired' });
    expect(storage.getFileStream).not.toHaveBeenCalled();
});

test('retains a missing-file placeholder when the attachment row is gone', async () => {
    const { contextMap, storage } = await setup();
    expect(
        (await resolveThreadImages({ contextMap, files: [], storage })).get(
            'image-1',
        ),
    ).toEqual({ status: 'missing' });
    expect(storage.getFileStream).not.toHaveBeenCalled();
});

test('does not read an image attached to a different prompt', async () => {
    const { read, file, storage } = await setup();
    file.promptUuid = 'another-prompt';
    expect((await read()).get(file.uuid)).toEqual({ status: 'missing' });
    expect(storage.getFileStream).not.toHaveBeenCalled();
});

test('incomplete uploads have a distinct placeholder and cannot be read', async () => {
    const { read, file, storage } = await setup();
    file.uploadedAt = null;
    expect((await read()).get(file.uuid)).toEqual({ status: 'incomplete' });
    expect(storage.getFileStream).not.toHaveBeenCalled();
});

test('object 404s become missing placeholders but transient errors fail the request visibly', async () => {
    const { read, storage } = await setup();
    storage.getFileStream.mockRejectedValueOnce(new NotFoundError('missing'));
    expect((await read()).get('image-1')).toEqual({ status: 'missing' });
    const error = new Error('temporarily unavailable');
    storage.getFileStream.mockRejectedValueOnce(error);
    await expect(read()).rejects.toBe(error);
});

test('oversized storage objects become missing placeholders, report integrity failure and destroy the stream', async () => {
    const { read, storage } = await setup();
    const stream = Readable.from([Buffer.alloc(AI_THREAD_IMAGE_MAX_BYTES + 1)]);
    storage.getFileStream.mockResolvedValue({
        stream,
        contentDisposition: null,
    });
    expect((await read()).get('image-1')).toEqual({ status: 'missing' });
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            message: 'An attached image exceeds its stored size.',
        }),
    );
    expect(stream.destroyed).toBe(true);
});

test('partial storage reads cannot silently become image parts', async () => {
    const { read, bytes, storage } = await setup();
    storage.getFileStream.mockResolvedValue({
        stream: Readable.from([bytes.subarray(0, -1)]),
        contentDisposition: null,
    });
    const pending = read();
    await expect(pending).rejects.toThrow('read completely');
    await expect(pending).rejects.not.toBeInstanceOf(ParameterError);
    expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('non-binary storage data reports an integrity failure without bricking the thread', async () => {
    const { read, storage } = await setup();
    storage.getFileStream.mockResolvedValue({
        stream: Readable.from(['not binary']),
        contentDisposition: null,
    });
    expect((await read()).get('image-1')).toEqual({ status: 'missing' });
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            message: 'Image storage returned non-binary data',
        }),
    );
});

test('the 30-second deadline covers stalled storage requests', async () => {
    const { read, storage } = await setup();
    vi.useFakeTimers();
    try {
        storage.getFileStream.mockImplementation(() => new Promise(() => {}));
        await Promise.all([
            expect(read()).rejects.toThrow('timed out'),
            vi.advanceTimersByTimeAsync(30_000),
        ]);
        expect(
            storage.getFileStream.mock.calls[0]?.[1]?.abortSignal.aborted,
        ).toBe(true);
    } finally {
        vi.useRealTimers();
    }
});

test('the deadline also terminates a stalled response stream', async () => {
    const { read, storage } = await setup();
    const stream = new Readable({ read() {} });
    vi.useFakeTimers();
    try {
        storage.getFileStream.mockResolvedValue({
            stream,
            contentDisposition: null,
        });
        await Promise.all([
            expect(read()).rejects.toThrow('timed out'),
            vi.advanceTimersByTimeAsync(30_000),
        ]);
        expect(stream.destroyed).toBe(true);
    } finally {
        vi.useRealTimers();
    }
});

test('an image expiring during its read is not sent to the model', async () => {
    const { read, file, bytes, storage } = await setup();
    vi.useFakeTimers();
    try {
        storage.getFileStream.mockImplementation(async () => {
            vi.setSystemTime(file.expiresAt);
            return { stream: Readable.from([bytes]), contentDisposition: null };
        });
        expect((await read()).get(file.uuid)).toEqual({ status: 'expired' });
    } finally {
        vi.useRealTimers();
    }
});

test('actual bytes cannot exceed the thread budget through under-reported historical snapshots', async () => {
    const { file, item, contextMap, storage } = await setup();
    const bytes = Buffer.alloc(AI_THREAD_IMAGE_MAX_BYTES);
    const files = Array.from({ length: 5 }, (_, index) => ({
        ...file,
        uuid: `large-${index}`,
        storageKey: `large-${index}`,
        sizeBytes: bytes.length,
    }));
    contextMap.set(
        'prompt-1',
        files.map((image) => ({ ...item, fileUuid: image.uuid, sizeBytes: 1 })),
    );
    storage.getFileStream.mockImplementation(async () => ({
        stream: Readable.from([bytes]),
        contentDisposition: null,
    }));
    const result = await resolveThreadImages({ contextMap, files, storage });
    expect([...result.values()]).toEqual(
        files.map(() => ({ status: 'missing' })),
    );
    expect(storage.getFileStream).toHaveBeenCalledTimes(4);
    expect(Sentry.captureException).toHaveBeenCalledOnce();
});

test('the retained-image budget is enforced before fetching any bytes', async () => {
    const { contextMap, item, storage } = await setup();
    contextMap.set(
        'oversized',
        Array.from({ length: 5 }, (_, index) => ({
            ...item,
            fileUuid: `large-${index}`,
            sizeBytes: AI_THREAD_IMAGE_MAX_BYTES,
        })),
    );
    const result = await resolveThreadImages({
        contextMap,
        files: [],
        storage,
    });
    expect(
        [...result.values()].every(({ status }) => status === 'missing'),
    ).toBe(true);
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(storage.getFileStream).not.toHaveBeenCalled();
});
