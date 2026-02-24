import { NotFoundError } from '@lightdash/common';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
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
    | 'api'
    | 'other';

type PersistentDownloadFileServiceArguments = {
    analytics?: LightdashAnalytics;
    lightdashConfig: LightdashConfig;
    persistentDownloadFileModel: PersistentDownloadFileModel;
    fileStorageClient: FileStorageClient;
};

const PERSISTENT_URL_S3_EXPIRY_SECONDS = 300; // 5 minutes

export class PersistentDownloadFileService extends BaseService {
    private readonly analytics: LightdashAnalytics | undefined;

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
        if (!this.lightdashConfig.persistentDownloadUrls.enabled) {
            this.logger.debug(
                'Persistent download URLs disabled, returning raw S3 URL',
            );
            return this.fileStorageClient.getFileUrl(data.s3Key);
        }

        const fileNanoid = nanoid();
        const expirationSeconds =
            data.expirationSeconds ??
            this.lightdashConfig.persistentDownloadUrls.expirationSeconds;
        const expiresAt = new Date(Date.now() + expirationSeconds * 1000);
        const createStartedAt = Date.now();
        const source = data.source || 'other';
        this.analytics?.track({
            event: 'persistent_file.generation_requested',
            userId: data.createdByUserUuid || undefined,
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
        try {
            await this.persistentDownloadFileModel.create({
                nanoid: fileNanoid,
                s3Key: data.s3Key,
                fileType: data.fileType,
                organizationUuid: data.organizationUuid,
                projectUuid: data.projectUuid,
                createdByUserUuid: data.createdByUserUuid,
                expiresAt,
            });
            this.analytics?.track({
                event: 'persistent_file.generation_completed',
                userId: data.createdByUserUuid || undefined,
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
        } catch (error) {
            this.analytics?.track({
                event: 'persistent_file.generation_failed',
                userId: data.createdByUserUuid || undefined,
                properties: {
                    fileUuid: fileNanoid,
                    organizationId: data.organizationUuid,
                    projectId: data.projectUuid,
                    createdByUserUuid: data.createdByUserUuid,
                    fileType: data.fileType,
                    source,
                    errorName:
                        error instanceof Error ? error.name : 'UnknownError',
                    errorMessage:
                        error instanceof Error
                            ? `${error.message}`
                            : `${String(error)}`,
                    durationMs: Date.now() - createStartedAt,
                },
            });
            throw error;
        }

        const url = new URL(
            `/api/v1/file/${fileNanoid}`,
            this.lightdashConfig.siteUrl,
        ).href;

        this.logger.debug(
            `Created persistent download URL: nanoid=${fileNanoid}, fileType=${data.fileType}, expiresAt=${expiresAt.toISOString()}`,
        );

        return url;
    }

    async getSignedUrl(
        fileNanoid: string,
        requestContext?: {
            ip: string | undefined;
            userAgent: string | undefined;
            requestedByUserUuid?: string;
        },
    ): Promise<string> {
        const requestStartedAt = Date.now();
        const file = await this.persistentDownloadFileModel.get(fileNanoid);

        if (file.expires_at < new Date()) {
            this.logger.debug(
                `Persistent download link expired: nanoid=${fileNanoid}, expiredAt=${file.expires_at.toISOString()}`,
            );
            throw new NotFoundError('This download link has expired');
        }

        this.analytics?.track({
            event: 'persistent_file.url_requested',
            userId: requestContext?.requestedByUserUuid || undefined,
            properties: {
                fileUuid: fileNanoid,
                organizationId: file.organization_uuid,
                projectId: file.project_uuid,
                createdByUserUuid: file.created_by_user_uuid,
                requestedByUserUuid:
                    requestContext?.requestedByUserUuid || null,
                source: 'api',
                hasIpAddress: Boolean(requestContext?.ip),
                hasUserAgent: Boolean(requestContext?.userAgent),
            },
        });

        const signedUrl = await this.fileStorageClient.getFileUrl(
            file.s3_key,
            PERSISTENT_URL_S3_EXPIRY_SECONDS,
        );

        this.analytics?.track({
            event: 'persistent_file.url_responded',
            userId: requestContext?.requestedByUserUuid || undefined,
            properties: {
                fileUuid: fileNanoid,
                organizationId: file.organization_uuid,
                projectId: file.project_uuid,
                createdByUserUuid: file.created_by_user_uuid,
                requestedByUserUuid:
                    requestContext?.requestedByUserUuid || null,
                source: 'api',
                statusCode: 302,
                responseMs: Date.now() - requestStartedAt,
            },
        });
        this.logger.info(
            `Serving persistent download: nanoid=${fileNanoid}, ip=${requestContext?.ip}, userAgent=${requestContext?.userAgent}`,
        );
        return signedUrl;
    }
}
