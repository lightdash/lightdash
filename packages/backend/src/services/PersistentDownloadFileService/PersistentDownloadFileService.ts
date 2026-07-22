import {
    NotFoundError,
    ParameterError,
    S3_PRESIGNED_URL_MAX_EXPIRATION_SECONDS,
} from '@lightdash/common';
import { nanoid } from 'nanoid';
import { type Readable } from 'stream';
import {
    ANONYMOUS_TRACKING_UUID,
    type LightdashAnalytics,
} from '../../analytics/LightdashAnalytics';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import { PersistentDownloadFileModel } from '../../models/PersistentDownloadFileModel';
import { BaseService } from '../BaseService';

export type PersistentDownloadFileSource =
    | 'chart'
    | 'dashboard'
    | 'sql_chart'
    | 'pivot'
    | 'analytics'
    | 'async_query'
    | 'scheduler'
    | 'other';

type PersistentDownloadFileServiceArguments = {
    analytics: LightdashAnalytics;
    lightdashConfig: LightdashConfig;
    persistentDownloadFileModel: PersistentDownloadFileModel;
    fileStorageClient: FileStorageClient;
};

const PERSISTENT_URL_S3_EXPIRY_SECONDS = 300; // 5 minutes

export class PersistentDownloadFileService extends BaseService {
    private readonly analytics: LightdashAnalytics;
    private readonly lightdashConfig: LightdashConfig;

    private readonly persistentDownloadFileModel: PersistentDownloadFileModel;

    private readonly fileStorageClient: FileStorageClient;

    constructor({
        analytics,
        lightdashConfig,
        persistentDownloadFileModel,
        fileStorageClient,
    }: PersistentDownloadFileServiceArguments) {
        super();
        this.analytics = analytics;
        this.lightdashConfig = lightdashConfig;
        this.persistentDownloadFileModel = persistentDownloadFileModel;
        this.fileStorageClient = fileStorageClient;
    }

    async createPersistentUrl(data: {
        s3Key: string;
        fileType: string;
        organizationUuid: string;
        projectUuid: string | null;
        createdByUserUuid: string | null;
        expirationSeconds?: number;
        source?: PersistentDownloadFileSource;
    }): Promise<string> {
        // Use the persistent-URL system when the instance enables it
        // (PERSISTENT_DOWNLOAD_URLS_ENABLED, off by default), or transparently
        // when the requested expiry exceeds what a raw S3 presigned URL can do
        // (7 days) — that's the only way a link can live that long, so it wins
        // even when the instance hasn't opted in. Otherwise hand back a raw
        // presigned URL honoring the requested expiry (undefined falls back to
        // the S3 default).
        const exceedsS3Limit =
            data.expirationSeconds !== undefined &&
            data.expirationSeconds > S3_PRESIGNED_URL_MAX_EXPIRATION_SECONDS;
        const usePersistent =
            this.lightdashConfig.persistentDownloadUrls.enabled ||
            exceedsS3Limit;
        if (!usePersistent) {
            this.logger.debug(
                'Persistent download URLs disabled, returning raw S3 URL',
            );
            return this.fileStorageClient.getFileUrl(
                data.s3Key,
                data.expirationSeconds,
            );
        }

        const fileNanoid = nanoid();
        const expirationSeconds =
            data.expirationSeconds ??
            this.lightdashConfig.persistentDownloadUrls.expirationSeconds;
        const expiresAt = new Date(Date.now() + expirationSeconds * 1000);
        const source = data.source ?? 'other';
        const createStartedAt = Date.now();
        this.analytics.track({
            event: 'persistent_file.generation_requested',
            userId: data.createdByUserUuid ?? ANONYMOUS_TRACKING_UUID,
            properties: {
                fileUuid: fileNanoid,
                organizationId: data.organizationUuid,
                projectId: data.projectUuid,
                createdByUserUuid: data.createdByUserUuid,
                fileType: data.fileType,
                source,
                expirationSeconds,
            },
        });
        await this.persistentDownloadFileModel.create({
            nanoid: fileNanoid,
            s3Key: data.s3Key,
            fileType: data.fileType,
            organizationUuid: data.organizationUuid,
            projectUuid: data.projectUuid,
            createdByUserUuid: data.createdByUserUuid,
            expiresAt,
        });
        this.analytics.track({
            event: 'persistent_file.generation_completed',
            userId: data.createdByUserUuid ?? ANONYMOUS_TRACKING_UUID,
            properties: {
                fileUuid: fileNanoid,
                organizationId: data.organizationUuid,
                projectId: data.projectUuid,
                createdByUserUuid: data.createdByUserUuid,
                fileType: data.fileType,
                source,
                expirationSeconds,
                durationMs: Date.now() - createStartedAt,
            },
        });

        const url = new URL(
            `/api/v1/file/${fileNanoid}`,
            this.lightdashConfig.siteUrl,
        ).href;

        this.logger.debug(
            `Created persistent download URL: nanoid=${fileNanoid}, fileType=${data.fileType}, expiresAt=${expiresAt.toISOString()}`,
        );

        return url;
    }

    /**
     * Deletes the stored object and its persistent-URL row. The caller must
     * pass the S3 key prefix it owns so a link can never delete a file
     * belonging to another feature.
     */
    async deleteFileWithKeyPrefix(
        fileNanoid: string,
        s3KeyPrefix: string,
    ): Promise<void> {
        const file = await this.persistentDownloadFileModel.get(fileNanoid);
        if (!file.s3_key.startsWith(s3KeyPrefix)) {
            throw new ParameterError(
                `File ${fileNanoid} is not stored under ${s3KeyPrefix}`,
            );
        }
        await this.fileStorageClient.deleteFile(file.s3_key);
        await this.persistentDownloadFileModel.delete(fileNanoid);
    }

    private async getValidFile(fileNanoid: string) {
        const file = await this.persistentDownloadFileModel.get(fileNanoid);

        if (file.expires_at < new Date()) {
            this.logger.debug(
                `Persistent download link expired: nanoid=${fileNanoid}, expiredAt=${file.expires_at.toISOString()}`,
            );
            throw new NotFoundError('This download link has expired');
        }

        return file;
    }

    /**
     * @deprecated Prefer `getFileStream` to avoid exposing internal S3
     * endpoints to end users. Kept for backwards compatibility.
     */
    async getSignedUrl(
        fileNanoid: string,
        requestContext?: {
            ip: string | undefined;
            userAgent: string | undefined;
            requestedByUserUuid: string | null;
        },
    ): Promise<string> {
        const file = await this.getValidFile(fileNanoid);

        const signedUrl = await this.fileStorageClient.getFileUrl(
            file.s3_key,
            PERSISTENT_URL_S3_EXPIRY_SECONDS,
        );

        this.logger.info(
            `Serving persistent download (redirect): nanoid=${fileNanoid}, ip=${requestContext?.ip}, userAgent=${requestContext?.userAgent}`,
        );
        return signedUrl;
    }

    async getFileStream(
        fileNanoid: string,
        requestContext?: {
            ip: string | undefined;
            userAgent: string | undefined;
            requestedByUserUuid: string | null;
        },
    ): Promise<{
        stream: Readable;
        fileType: string;
        s3Key: string;
    }> {
        const file = await this.getValidFile(fileNanoid);
        const requestStartedAt = Date.now();
        const requestedByUserUuid =
            requestContext?.requestedByUserUuid ?? null;
        this.analytics.track({
            event: 'persistent_file.url_requested',
            userId: requestedByUserUuid ?? ANONYMOUS_TRACKING_UUID,
            properties: {
                fileUuid: fileNanoid,
                organizationId: file.organization_uuid,
                projectId: file.project_uuid,
                createdByUserUuid: file.created_by_user_uuid,
                requestedByUserUuid,
                source: 'api',
            },
        });

        const stream = await this.fileStorageClient.getFileStream(file.s3_key);

        this.analytics.track({
            event: 'persistent_file.url_responded',
            userId: requestedByUserUuid ?? ANONYMOUS_TRACKING_UUID,
            properties: {
                fileUuid: fileNanoid,
                organizationId: file.organization_uuid,
                projectId: file.project_uuid,
                createdByUserUuid: file.created_by_user_uuid,
                requestedByUserUuid,
                source: 'api',
                statusCode: 200,
                responseMs: Date.now() - requestStartedAt,
            },
        });

        this.logger.info(
            `Serving persistent download (stream): nanoid=${fileNanoid}, ip=${requestContext?.ip}, userAgent=${requestContext?.userAgent}`,
        );

        return {
            stream,
            fileType: file.file_type,
            s3Key: file.s3_key,
        };
    }
}
