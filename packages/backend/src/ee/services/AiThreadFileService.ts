import {
    AI_THREAD_FILE_MAX_BYTES,
    AI_THREAD_FILE_MAX_NAME_LENGTH,
    AI_THREAD_FILE_MAX_UNCLAIMED_PER_USER,
    AI_THREAD_FILE_MAX_UPLOADS_PER_MINUTE,
    AI_THREAD_IMAGE_RETENTION_DAYS,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    TooManyRequestsError,
    type AiThreadFile,
    type AiThreadImageMediaType,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { toSessionUser } from '../../auth/account';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import Logger from '../../logging/logger';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../../services/BaseService';
import type { AiThreadFileModel } from '../models/AiThreadFileModel';
import { normalizeThreadImage } from './ai/threadImages';
import type { AiAgentService } from './AiAgentService/AiAgentService';

type AiThreadFileServiceDependencies = {
    aiThreadFileModel: Pick<
        AiThreadFileModel,
        | 'create'
        | 'createImage'
        | 'countRecentUploadsForUser'
        | 'countUnclaimedForUser'
        | 'deleteUnclaimed'
        | 'markImageUploaded'
        | 'sweepExpiredUnclaimed'
        | 'findImageObjectsForCleanup'
        | 'markImageCleanupAttempted'
        | 'markImageObjectDeleted'
    >;
    aiAgentService: Pick<AiAgentService, 'getIsCopilotEnabled'>;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    uploadsFileStorageClient: Pick<
        FileStorageClient,
        'isEnabled' | 'createUploadStream' | 'deleteFile'
    >;
    durableUploadsConfigured: boolean;
};

export type AiThreadFileUploadInput = { fileName: string; bytes: Buffer };
const UPLOAD_RATE_WINDOW_MS = 60 * 1000;
const SWEEP_BATCH_SIZE = 100;
const MAX_SWEEP_BATCHES = 10;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/** Strict UTF-8 decode, then BOM strip and CRLF/CR → LF. */
export const normalizeThreadFileText = (bytes: Buffer): string => {
    let text: string;
    try {
        text = utf8Decoder.decode(bytes);
    } catch {
        throw new ParameterError(
            'Only UTF-8 text files can be attached to a conversation',
        );
    }
    if (text.includes('\u0000')) {
        throw new ParameterError(
            'Only UTF-8 text files can be attached to a conversation',
        );
    }
    return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
};

/** Keep only the base name so the agent mount path is always `/attachments/<name>`. */
export const sanitizeThreadFileName = (fileName: string): string => {
    const base = fileName.trim().split(/[\\/]/).pop() ?? '';
    // eslint-disable-next-line no-control-regex
    const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (cleaned.length === 0 || cleaned === '.' || cleaned === '..')
        throw new ParameterError('File name is required');
    if (cleaned.length > AI_THREAD_FILE_MAX_NAME_LENGTH) {
        throw new ParameterError(
            `File name must be at most ${AI_THREAD_FILE_MAX_NAME_LENGTH} characters`,
        );
    }
    return cleaned;
};

const imageExtensions = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
} satisfies Record<AiThreadImageMediaType, string>;

export class AiThreadFileService extends BaseService {
    private readonly aiThreadFileModel: AiThreadFileServiceDependencies['aiThreadFileModel'];
    private readonly aiAgentService: AiThreadFileServiceDependencies['aiAgentService'];
    private readonly featureFlagModel: AiThreadFileServiceDependencies['featureFlagModel'];
    private readonly uploadsFileStorageClient: AiThreadFileServiceDependencies['uploadsFileStorageClient'];
    private readonly durableUploadsConfigured: boolean;

    constructor(dependencies: AiThreadFileServiceDependencies) {
        super();
        this.aiThreadFileModel = dependencies.aiThreadFileModel;
        this.aiAgentService = dependencies.aiAgentService;
        this.featureFlagModel = dependencies.featureFlagModel;
        this.uploadsFileStorageClient = dependencies.uploadsFileStorageClient;
        this.durableUploadsConfigured = dependencies.durableUploadsConfigured;
    }

    private async assertCanUpload(user: SessionUser): Promise<string> {
        if (!user.organizationUuid)
            throw new ForbiddenError('User must belong to an organization');
        if (!(await this.aiAgentService.getIsCopilotEnabled(user)))
            throw new ForbiddenError('Copilot is not enabled');
        return user.organizationUuid;
    }

    private async assertUploadQuota(userUuid: string): Promise<void> {
        const [recentUploads, unclaimedCount] = await Promise.all([
            this.aiThreadFileModel.countRecentUploadsForUser(
                userUuid,
                UPLOAD_RATE_WINDOW_MS,
            ),
            this.aiThreadFileModel.countUnclaimedForUser(userUuid),
        ]);
        if (recentUploads >= AI_THREAD_FILE_MAX_UPLOADS_PER_MINUTE) {
            throw new TooManyRequestsError(
                'Too many uploads. Wait a minute and try again.',
            );
        }
        if (unclaimedCount >= AI_THREAD_FILE_MAX_UNCLAIMED_PER_USER) {
            throw new TooManyRequestsError(
                'Too many unsent files. Send or remove some before uploading more.',
            );
        }
    }

    async upload(
        user: SessionUser,
        input: AiThreadFileUploadInput,
    ): Promise<AiThreadFile> {
        const organizationUuid = await this.assertCanUpload(user);
        const fileName = sanitizeThreadFileName(input.fileName);
        await this.assertUploadQuota(user.userUuid);
        if (input.bytes.length > AI_THREAD_FILE_MAX_BYTES) {
            throw new ParameterError(
                `File exceeds the ${AI_THREAD_FILE_MAX_BYTES / 1024} KB limit`,
            );
        }
        if (input.bytes.length === 0)
            throw new ParameterError('Upload body is empty');
        const content = normalizeThreadFileText(input.bytes);
        if (content.trim().length === 0)
            throw new ParameterError('The file is empty');
        return this.aiThreadFileModel.create({
            organizationUuid,
            createdByUserUuid: user.userUuid,
            fileName,
            content,
            sizeBytes: Buffer.byteLength(content, 'utf8'),
        });
    }

    async uploadImage(
        account: RegisteredAccount,
        input: AiThreadFileUploadInput,
    ): Promise<AiThreadFile> {
        const user = toSessionUser(account);
        const organizationUuid = await this.assertCanUpload(user);
        const flag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.AiThreadImages,
        });
        if (!flag.enabled)
            throw new ForbiddenError('Image attachments are not enabled.');
        if (
            !this.durableUploadsConfigured ||
            !this.uploadsFileStorageClient.isEnabled()
        ) {
            throw new ParameterError(
                'Image attachments require a durable uploads bucket. Ask an administrator to configure it.',
            );
        }
        const fileName = sanitizeThreadFileName(input.fileName);
        await this.assertUploadQuota(user.userUuid);
        const normalized = await normalizeThreadImage(input.bytes);
        const fileUuid = randomUUID();
        const storageKey = `ai-chat-images/${organizationUuid}/${fileUuid}.${imageExtensions[normalized.mediaType]}`;
        const createdAt = new Date();
        const file = await this.aiThreadFileModel.createImage({
            fileUuid,
            createdByUserUuid: user.userUuid,
            fileName,
            object: {
                storage_key: storageKey,
                organization_uuid: organizationUuid,
                media_type: normalized.mediaType,
                width: normalized.width,
                height: normalized.height,
                size_bytes: normalized.bytes.length,
                created_at: createdAt,
                expires_at: new Date(
                    createdAt.getTime() +
                        AI_THREAD_IMAGE_RETENTION_DAYS * 86400000,
                ),
            },
        });
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), 60_000);
        timeout.unref();
        try {
            const { writeStream, close } =
                this.uploadsFileStorageClient.createUploadStream(storageKey, {
                    contentType: normalized.mediaType,
                    abortController,
                });
            writeStream.write(normalized.bytes);
            await close();
            await this.aiThreadFileModel.markImageUploaded(storageKey);
            return file;
        } catch (error) {
            // The independent ledger survives both failed puts and failed cleanup.
            await this.aiThreadFileModel
                .deleteUnclaimed({ fileUuid, userUuid: user.userUuid })
                .catch(() => {
                    Logger.warn(
                        'Failed to remove an incomplete image attachment row',
                        { fileUuid },
                    );
                });
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    /** Only the uploader may delete, and only before the file is sent. */
    async delete(user: SessionUser, fileUuid: string): Promise<void> {
        await this.assertCanUpload(user);
        if (
            !(await this.aiThreadFileModel.deleteUnclaimed({
                fileUuid,
                userUuid: user.userUuid,
            }))
        ) {
            throw new NotFoundError('File not found');
        }
    }

    /* eslint-disable no-await-in-loop -- Each bounded batch depends on the previous batch; keep mark/delete operations ordered. */
    async sweepExpiredUnclaimed(): Promise<void> {
        let swept = 0;
        for (let batch = 0; batch < MAX_SWEEP_BATCHES; batch += 1) {
            const count = await this.aiThreadFileModel.sweepExpiredUnclaimed();
            swept += count;
            if (count < SWEEP_BATCH_SIZE) break;
            if (batch === MAX_SWEEP_BATCHES - 1)
                Logger.warn('AI attachment cleanup reached its batch limit');
        }
        if (swept > 0)
            Logger.info(`Swept ${swept} expired unclaimed AI thread files`);
        // Cleanup is intentionally independent of the feature's rollout flag.
        const attemptedBefore = new Date();
        for (let batch = 0; batch < MAX_SWEEP_BATCHES; batch += 1) {
            const objects =
                await this.aiThreadFileModel.findImageObjectsForCleanup(
                    attemptedBefore,
                );
            for (const object of objects) {
                await this.aiThreadFileModel.markImageCleanupAttempted(
                    object.storage_key,
                );
                try {
                    if (object.object_deleted_at === null) {
                        try {
                            await this.uploadsFileStorageClient.deleteFile(
                                object.storage_key,
                                { abortSignal: AbortSignal.timeout(30_000) },
                            );
                        } catch (error) {
                            if (!(error instanceof NotFoundError)) throw error;
                        }
                    }
                    await this.aiThreadFileModel.markImageObjectDeleted(
                        object.storage_key,
                    );
                } catch {
                    Logger.error(
                        'Failed to delete an AI image object; cleanup will retry',
                        { storageKey: object.storage_key },
                    );
                }
            }
            if (objects.length < SWEEP_BATCH_SIZE) break;
            if (batch === MAX_SWEEP_BATCHES - 1)
                Logger.warn('AI image cleanup reached its batch limit');
        }
    }
    /* eslint-enable no-await-in-loop */
}
