import {
    NotFoundError,
    S3_PRESIGNED_URL_MAX_EXPIRATION_SECONDS,
} from '@lightdash/common';
import { nanoid } from 'nanoid';
import { type Readable } from 'stream';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import { PersistentDownloadFileModel } from '../../models/PersistentDownloadFileModel';
import { BaseService } from '../BaseService';

type PersistentDownloadFileServiceArguments = {
    lightdashConfig: LightdashConfig;
    persistentDownloadFileModel: PersistentDownloadFileModel;
    fileStorageClient: FileStorageClient;
};

const PERSISTENT_URL_S3_EXPIRY_SECONDS = 300; // 5 minutes

export class PersistentDownloadFileService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly persistentDownloadFileModel: PersistentDownloadFileModel;

    private readonly fileStorageClient: FileStorageClient;

    constructor({
        lightdashConfig,
        persistentDownloadFileModel,
        fileStorageClient,
    }: PersistentDownloadFileServiceArguments) {
        super();
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
        await this.persistentDownloadFileModel.create({
            nanoid: fileNanoid,
            s3Key: data.s3Key,
            fileType: data.fileType,
            organizationUuid: data.organizationUuid,
            projectUuid: data.projectUuid,
            createdByUserUuid: data.createdByUserUuid,
            expiresAt,
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
        },
    ): Promise<{
        stream: Readable;
        fileType: string;
        s3Key: string;
    }> {
        const file = await this.getValidFile(fileNanoid);

        const stream = await this.fileStorageClient.getFileStream(file.s3_key);

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
