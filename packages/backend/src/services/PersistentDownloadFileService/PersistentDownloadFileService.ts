import { subject } from '@casl/ability';
import {
    assertUnreachable,
    NotFoundError,
    ParameterError,
    PersistentDownloadFileAccessMode,
    S3_PRESIGNED_URL_MAX_EXPIRATION_SECONDS,
    type Account,
} from '@lightdash/common';
import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { type Readable } from 'stream';
import {
    ANONYMOUS_TRACKING_UUID,
    type LightdashAnalytics,
} from '../../analytics/LightdashAnalytics';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import { type DbPersistentDownloadFile } from '../../database/entities/persistentDownloadFile';
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
const DOWNLOAD_TOKEN_TYPE = 'persistent-download';
const DOWNLOAD_TOKEN_ISSUER = 'lightdash';
const DOWNLOAD_TOKEN_AUDIENCE = 'persistent-download';

type DownloadTokenPayload = {
    type: typeof DOWNLOAD_TOKEN_TYPE;
    fileId: string;
};

type PersistentDownloadRequestContext = {
    account: Account | undefined;
    downloadToken: string | undefined;
    ip: string | undefined;
    userAgent: string | undefined;
};

const deriveDownloadSigningKey = (lightdashSecret: string): Buffer =>
    createHmac('sha256', lightdashSecret)
        .update('persistent-download-token')
        .digest();

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
        accessMode: Exclude<
            PersistentDownloadFileAccessMode,
            PersistentDownloadFileAccessMode.LEGACY_PUBLIC
        >;
        expirationSeconds?: number;
        source?: PersistentDownloadFileSource;
    }): Promise<string> {
        const exceedsS3Limit =
            data.expirationSeconds !== undefined &&
            data.expirationSeconds > S3_PRESIGNED_URL_MAX_EXPIRATION_SECONDS;
        if (
            data.accessMode === PersistentDownloadFileAccessMode.SIGNED &&
            !this.lightdashConfig.persistentDownloadUrls.enabled &&
            !exceedsS3Limit
        ) {
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
                accessMode: data.accessMode,
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
            accessMode: data.accessMode,
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
                accessMode: data.accessMode,
                expirationSeconds,
                durationMs: Date.now() - createStartedAt,
            },
        });

        const url = new URL(
            `/api/v1/file/${fileNanoid}`,
            this.lightdashConfig.siteUrl,
        );

        if (data.accessMode === PersistentDownloadFileAccessMode.SIGNED) {
            url.searchParams.set(
                'downloadToken',
                jwt.sign(
                    {
                        type: DOWNLOAD_TOKEN_TYPE,
                        fileId: fileNanoid,
                    } satisfies DownloadTokenPayload,
                    deriveDownloadSigningKey(
                        this.lightdashConfig.lightdashSecrets.active,
                    ),
                    {
                        expiresIn: Math.max(1, expirationSeconds),
                        issuer: DOWNLOAD_TOKEN_ISSUER,
                        audience: DOWNLOAD_TOKEN_AUDIENCE,
                        algorithm: 'HS256',
                    },
                ),
            );
        }

        this.logger.debug('Created persistent download URL', {
            fileUuid: fileNanoid,
            fileType: data.fileType,
            accessMode: data.accessMode,
            expiresAt: expiresAt.toISOString(),
        });

        return url.href;
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
            this.logger.debug('Persistent download link expired', {
                fileUuid: fileNanoid,
                expiredAt: file.expires_at.toISOString(),
            });
            throw new NotFoundError('This download link has expired');
        }

        return file;
    }

    private isActiveRegisteredAccount(
        account: Account | undefined,
    ): account is Account & { user: Account['user'] & { userUuid: string } } {
        return Boolean(
            account &&
            account.user.type === 'registered' &&
            (account.authentication.type === 'service-account' ||
                account.user.isActive),
        );
    }

    private async getAuthorizedFile(
        fileNanoid: string,
        requestContext: PersistentDownloadRequestContext,
    ): Promise<DbPersistentDownloadFile> {
        const file = await this.getValidFile(fileNanoid);
        const canViewFileProject = (): boolean => {
            const { account } = requestContext;
            if (!this.isActiveRegisteredAccount(account)) return false;
            if (
                account.organization.organizationUuid !== file.organization_uuid
            ) {
                return false;
            }
            if (file.project_uuid === null) return true;

            return this.createAuditedAbility(account).can(
                'view',
                subject('Project', {
                    organizationUuid: file.organization_uuid,
                    projectUuid: file.project_uuid,
                }),
            );
        };
        const canCreatorAccess = (): boolean => {
            const { account } = requestContext;
            return (
                this.isActiveRegisteredAccount(account) &&
                file.created_by_user_uuid !== null &&
                file.created_by_user_uuid === account.user.userUuid &&
                canViewFileProject()
            );
        };
        const hasValidDownloadToken = (): boolean => {
            const { downloadToken } = requestContext;
            if (!downloadToken) return false;

            // Tokens are minted with the active secret only; fallback
            // candidates keep links signed before a rotation valid.
            return this.lightdashConfig.lightdashSecrets.all.some(
                (candidateSecret) => {
                    try {
                        const decoded = jwt.verify(
                            downloadToken,
                            deriveDownloadSigningKey(candidateSecret),
                            {
                                algorithms: ['HS256'],
                                issuer: DOWNLOAD_TOKEN_ISSUER,
                                audience: DOWNLOAD_TOKEN_AUDIENCE,
                            },
                        );
                        return (
                            typeof decoded !== 'string' &&
                            decoded.type === DOWNLOAD_TOKEN_TYPE &&
                            decoded.fileId === fileNanoid
                        );
                    } catch {
                        return false;
                    }
                },
            );
        };
        let isAuthorized: boolean;

        switch (file.access_mode) {
            case PersistentDownloadFileAccessMode.LEGACY_PUBLIC:
                isAuthorized = true;
                break;
            case PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR:
                isAuthorized = canCreatorAccess();
                break;
            case PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT:
                isAuthorized = canViewFileProject();
                break;
            case PersistentDownloadFileAccessMode.SIGNED:
                isAuthorized = hasValidDownloadToken() || canCreatorAccess();
                break;
            default:
                return assertUnreachable(
                    file.access_mode,
                    'Unknown persistent download access mode',
                );
        }

        if (!isAuthorized) {
            this.logger.warn('Persistent download denied', {
                fileUuid: fileNanoid,
                accessMode: file.access_mode,
                ip: requestContext.ip,
                userAgent: requestContext.userAgent,
            });
            throw new NotFoundError('Cannot find file');
        }

        return file;
    }

    /**
     * @deprecated Prefer `getFileStream` to avoid exposing internal S3
     * endpoints to end users. Kept for backwards compatibility.
     */
    async getSignedUrl(
        fileNanoid: string,
        requestContext: PersistentDownloadRequestContext,
    ): Promise<string> {
        const file = await this.getAuthorizedFile(fileNanoid, requestContext);

        const signedUrl = await this.fileStorageClient.getFileUrl(
            file.s3_key,
            PERSISTENT_URL_S3_EXPIRY_SECONDS,
        );

        this.logger.info('Serving persistent download redirect', {
            fileUuid: fileNanoid,
            accessMode: file.access_mode,
            ip: requestContext.ip,
            userAgent: requestContext.userAgent,
        });
        return signedUrl;
    }

    async getFileStream(
        fileNanoid: string,
        requestContext: PersistentDownloadRequestContext,
    ): Promise<{
        stream: Readable;
        fileType: string;
        s3Key: string;
        contentDisposition: string | null;
    }> {
        const file = await this.getAuthorizedFile(fileNanoid, requestContext);
        const requestStartedAt = Date.now();
        const requestedByUserUuid = this.isActiveRegisteredAccount(
            requestContext.account,
        )
            ? requestContext.account.user.userUuid
            : null;
        this.analytics.track({
            event: 'persistent_file.url_requested',
            userId: requestedByUserUuid ?? ANONYMOUS_TRACKING_UUID,
            properties: {
                fileUuid: fileNanoid,
                organizationId: file.organization_uuid,
                projectId: file.project_uuid,
                createdByUserUuid: file.created_by_user_uuid,
                requestedByUserUuid,
                accessMode: file.access_mode,
                source: 'api',
            },
        });

        const { stream, contentDisposition } =
            await this.fileStorageClient.getFileStream(file.s3_key);

        this.analytics.track({
            event: 'persistent_file.url_responded',
            userId: requestedByUserUuid ?? ANONYMOUS_TRACKING_UUID,
            properties: {
                fileUuid: fileNanoid,
                organizationId: file.organization_uuid,
                projectId: file.project_uuid,
                createdByUserUuid: file.created_by_user_uuid,
                requestedByUserUuid,
                accessMode: file.access_mode,
                source: 'api',
                statusCode: 200,
                responseMs: Date.now() - requestStartedAt,
            },
        });

        this.logger.info('Serving persistent download stream', {
            fileUuid: fileNanoid,
            accessMode: file.access_mode,
            ip: requestContext.ip,
            userAgent: requestContext.userAgent,
        });

        return {
            stream,
            fileType: file.file_type,
            s3Key: file.s3_key,
            contentDisposition,
        };
    }
}
