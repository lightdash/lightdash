import {
    AI_THREAD_FILE_MAX_BYTES,
    AI_THREAD_FILE_MAX_UPLOADS_PER_MINUTE,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    TooManyRequestsError,
} from '@lightdash/common';
import { PassThrough } from 'node:stream';
import sharp from 'sharp';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type DbAiThreadImageObject } from '../database/entities/aiThreadFile';
import { type AiThreadFileModel } from '../models/AiThreadFileModel';
import { AiThreadFileService } from './AiThreadFileService';

const user = defaultSessionUser;
const account = fromSession(user);
const png = () =>
    sharp({ create: { width: 20, height: 10, channels: 3, background: 'red' } })
        .png()
        .toBuffer();

const setup = (durableUploadsConfigured = true) => {
    const model = {
        create: vi.fn<AiThreadFileModel['create']>(),
        createImage: vi
            .fn<AiThreadFileModel['createImage']>()
            .mockImplementation(async ({ fileUuid, fileName, object }) => ({
                uuid: fileUuid,
                kind: 'image',
                fileName,
                sizeBytes: object.size_bytes,
                mediaType: object.media_type,
                width: object.width,
                height: object.height,
                expiresAt: object.expires_at,
                threadUuid: null,
                promptUuid: null,
                createdAt: object.created_at,
            })),
        countRecentUploadsForUser: vi
            .fn<AiThreadFileModel['countRecentUploadsForUser']>()
            .mockResolvedValue(0),
        countUnclaimedForUser: vi
            .fn<AiThreadFileModel['countUnclaimedForUser']>()
            .mockResolvedValue(0),
        deleteUnclaimed: vi
            .fn<AiThreadFileModel['deleteUnclaimed']>()
            .mockResolvedValue(true),
        markImageUploaded: vi
            .fn<AiThreadFileModel['markImageUploaded']>()
            .mockResolvedValue(),
        sweepExpiredUnclaimed: vi
            .fn<AiThreadFileModel['sweepExpiredUnclaimed']>()
            .mockResolvedValue(0),
        findImageObjectsForCleanup: vi
            .fn<AiThreadFileModel['findImageObjectsForCleanup']>()
            .mockResolvedValue([]),
        markImageCleanupAttempted: vi
            .fn<AiThreadFileModel['markImageCleanupAttempted']>()
            .mockResolvedValue(),
        markImageObjectDeleted: vi
            .fn<AiThreadFileModel['markImageObjectDeleted']>()
            .mockResolvedValue(),
    };
    const featureFlagModel = {
        get: vi.fn<FeatureFlagModel['get']>().mockResolvedValue({
            id: FeatureFlags.AiThreadImages,
            enabled: true,
        }),
    };
    const aiAgentService = { getIsCopilotEnabled: vi.fn(async () => true) };
    const writeStream = new PassThrough();
    const chunks: Buffer[] = [];
    writeStream.on('data', (chunk: unknown) => {
        if (!Buffer.isBuffer(chunk))
            throw new Error('Expected binary image bytes');
        chunks.push(chunk);
    });
    const close = vi.fn(async () => {
        writeStream.end();
    });
    const storage = {
        isEnabled: vi.fn(() => true),
        createUploadStream: vi
            .fn<FileStorageClient['createUploadStream']>()
            .mockReturnValue({
                write: vi.fn(async () => {}),
                close,
                writeStream,
            }),
        deleteFile: vi
            .fn<FileStorageClient['deleteFile']>()
            .mockResolvedValue(),
    };
    const service = new AiThreadFileService({
        aiThreadFileModel: model,
        aiAgentService,
        featureFlagModel,
        uploadsFileStorageClient: storage,
        durableUploadsConfigured,
    });
    return {
        service,
        model,
        storage,
        featureFlagModel,
        aiAgentService,
        chunks,
        close,
    };
};

const cleanupObject = (key: string): DbAiThreadImageObject => ({
    storage_key: key,
    organization_uuid: 'organization',
    media_type: 'image/png',
    width: 20,
    height: 10,
    size_bytes: 100,
    created_at: new Date(0),
    uploaded_at: null,
    cleanup_attempted_at: null,
    expires_at: new Date(1),
    object_deleted_at: null,
});

test('uploads binary bytes with sniffed media type, private key and fixed expiration', async () => {
    const { service, model, storage, chunks } = setup();
    const bytes = await png();
    const file = await service.uploadImage(account, {
        fileName: '../../chart.jpg',
        bytes,
    });
    const created = model.createImage.mock.calls[0]?.[0];
    expect(file).toMatchObject({
        kind: 'image',
        fileName: 'chart.jpg',
        mediaType: 'image/png',
        width: 20,
        height: 10,
    });
    expect(file).not.toHaveProperty('storageKey');
    expect(created?.object.storage_key).toMatch(
        /^ai-chat-images\/test-org-uuid\/[0-9a-f-]+\.png$/,
    );
    expect(created?.object.expires_at.getTime()).toBe(
        (created?.object.created_at.getTime() ?? 0) + 30 * 86400000,
    );
    expect(Buffer.concat(chunks)).toEqual(await sharp(bytes).png().toBuffer());
    expect(storage.createUploadStream).toHaveBeenCalledWith(
        created?.object.storage_key,
        expect.objectContaining({
            contentType: 'image/png',
            abortController: expect.any(AbortController),
        }),
    );
    expect(model.markImageUploaded).toHaveBeenCalledWith(
        created?.object.storage_key,
    );
});

test('flag changes are resolved on every upload, without reconstructing the service', async () => {
    const { service, featureFlagModel, model } = setup();
    featureFlagModel.get.mockResolvedValue({
        id: FeatureFlags.AiThreadImages,
        enabled: false,
    });
    await expect(
        service.uploadImage(account, {
            fileName: 'chart.png',
            bytes: await png(),
        }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(model.createImage).not.toHaveBeenCalled();
    featureFlagModel.get.mockResolvedValue({
        id: FeatureFlags.AiThreadImages,
        enabled: true,
    });
    await expect(
        service.uploadImage(account, {
            fileName: 'chart.png',
            bytes: await png(),
        }),
    ).resolves.toMatchObject({ kind: 'image' });
    expect(featureFlagModel.get).toHaveBeenCalledWith({
        user: expect.objectContaining({
            userUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
        }),
        featureFlagId: FeatureFlags.AiThreadImages,
    });
});

test('the exports-bucket fallback cannot be used for image attachments', async () => {
    const { service, model, storage } = setup(false);
    await expect(
        service.uploadImage(account, {
            fileName: 'chart.png',
            bytes: await png(),
        }),
    ).rejects.toThrow('durable uploads bucket');
    expect(model.createImage).not.toHaveBeenCalled();
    expect(storage.createUploadStream).not.toHaveBeenCalled();
});

test('copilot denial is enforced before decoding or storing images', async () => {
    const { service, model, aiAgentService } = setup();
    aiAgentService.getIsCopilotEnabled.mockResolvedValue(false);
    await expect(
        service.uploadImage(account, {
            fileName: 'chart.png',
            bytes: await png(),
        }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(model.createImage).not.toHaveBeenCalled();
});

test('rate limits are shared with text attachments', async () => {
    const { service, model, storage } = setup();
    model.countRecentUploadsForUser.mockResolvedValue(
        AI_THREAD_FILE_MAX_UPLOADS_PER_MINUTE,
    );
    await expect(
        service.uploadImage(account, {
            fileName: 'chart.png',
            bytes: await png(),
        }),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(storage.createUploadStream).not.toHaveBeenCalled();
});

test('failed storage writes never mark an image ready and retain durable cleanup identity', async () => {
    const { service, model, close } = setup();
    close.mockRejectedValue(new Error('storage unavailable'));
    await expect(
        service.uploadImage(account, {
            fileName: 'chart.png',
            bytes: await png(),
        }),
    ).rejects.toThrow('storage unavailable');
    expect(model.markImageUploaded).not.toHaveBeenCalled();
    expect(model.deleteUnclaimed).toHaveBeenCalledWith({
        fileUuid: expect.any(String),
        userUuid: user.userUuid,
    });
});

test('the existing text upload cap is still 1 MiB', async () => {
    const { service, model } = setup();
    await expect(
        service.upload(user, {
            fileName: 'notes.txt',
            bytes: Buffer.alloc(AI_THREAD_FILE_MAX_BYTES + 1, 'a'),
        }),
    ).rejects.toBeInstanceOf(ParameterError);
    expect(model.create).not.toHaveBeenCalled();
});

test('unsent cleanup drains multiple batches independently of the image feature flag', async () => {
    const { service, model, featureFlagModel } = setup();
    model.sweepExpiredUnclaimed
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(2);
    await service.sweepExpiredUnclaimed();
    expect(model.sweepExpiredUnclaimed).toHaveBeenCalledTimes(2);
    expect(featureFlagModel.get).not.toHaveBeenCalled();
});

test('missing objects are marked deleted, while storage failures remain retryable', async () => {
    const { service, model, storage } = setup();
    model.findImageObjectsForCleanup.mockResolvedValueOnce([
        cleanupObject('missing'),
        cleanupObject('retry'),
        cleanupObject('success'),
    ]);
    storage.deleteFile
        .mockRejectedValueOnce(new NotFoundError('not found'))
        .mockRejectedValueOnce(new Error('unavailable'));
    await service.sweepExpiredUnclaimed();
    expect(model.markImageCleanupAttempted).toHaveBeenCalledTimes(3);
    expect(model.markImageObjectDeleted).toHaveBeenCalledWith('missing');
    expect(model.markImageObjectDeleted).not.toHaveBeenCalledWith('retry');
    expect(model.markImageObjectDeleted).toHaveBeenCalledWith('success');
});

test('expired-image cleanup drains batches using one fixed attempt cutoff', async () => {
    const { service, model } = setup();
    model.findImageObjectsForCleanup
        .mockResolvedValueOnce(
            Array.from({ length: 100 }, (_, index) =>
                cleanupObject(`image-${index}`),
            ),
        )
        .mockResolvedValueOnce([cleanupObject('last')]);
    await service.sweepExpiredUnclaimed();
    expect(model.markImageObjectDeleted).toHaveBeenCalledTimes(101);
    expect(model.findImageObjectsForCleanup.mock.calls[0]?.[0]).toBe(
        model.findImageObjectsForCleanup.mock.calls[1]?.[0],
    );
});
