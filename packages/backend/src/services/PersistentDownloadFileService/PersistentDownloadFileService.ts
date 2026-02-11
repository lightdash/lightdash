import { NotFoundError } from '@lightdash/common';
import { nanoid } from 'nanoid';
import { S3Client } from '../../clients/Aws/S3Client';
import { LightdashConfig } from '../../config/parseConfig';
import { PersistentDownloadFileModel } from '../../models/PersistentDownloadFileModel';
import { BaseService } from '../BaseService';

type PersistentDownloadFileServiceArguments = {
    lightdashConfig: LightdashConfig;
    persistentDownloadFileModel: PersistentDownloadFileModel;
    s3Client: S3Client;
};

export class PersistentDownloadFileService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly persistentDownloadFileModel: PersistentDownloadFileModel;

    private readonly s3Client: S3Client;

    constructor({
        lightdashConfig,
        persistentDownloadFileModel,
        s3Client,
    }: PersistentDownloadFileServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.persistentDownloadFileModel = persistentDownloadFileModel;
        this.s3Client = s3Client;
    }

    async createPersistentUrl(data: {
        s3Key: string;
        fileType: string;
        organizationUuid: string;
        projectUuid: string | null;
        createdByUserUuid: string | null;
    }): Promise<string> {
        if (!this.lightdashConfig.persistentDownloadUrls.enabled) {
            this.logger.debug(
                'Persistent download URLs disabled, returning raw S3 URL',
            );
            return this.s3Client.getFileUrl(data.s3Key);
        }

        const fileNanoid = nanoid();
        const { expirationSeconds } =
            this.lightdashConfig.persistentDownloadUrls;
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

    async getSignedUrl(fileNanoid: string): Promise<string> {
        const file = await this.persistentDownloadFileModel.get(fileNanoid);

        if (file.expires_at < new Date()) {
            this.logger.debug(
                `Persistent download link expired: nanoid=${fileNanoid}, expiredAt=${file.expires_at.toISOString()}`,
            );
            throw new NotFoundError('This download link has expired');
        }

        this.logger.debug(
            `Serving persistent download: nanoid=${fileNanoid}, s3Key=${file.s3_key}`,
        );
        return this.s3Client.getFileUrl(file.s3_key);
    }
}
