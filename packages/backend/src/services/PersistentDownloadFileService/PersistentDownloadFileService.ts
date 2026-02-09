import { ForbiddenError } from '@lightdash/common';
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
        const fileNanoid = nanoid();
        await this.persistentDownloadFileModel.create({
            nanoid: fileNanoid,
            s3Key: data.s3Key,
            fileType: data.fileType,
            organizationUuid: data.organizationUuid,
            projectUuid: data.projectUuid,
            createdByUserUuid: data.createdByUserUuid,
        });

        return new URL(
            `/api/v1/file/${fileNanoid}`,
            this.lightdashConfig.siteUrl,
        ).href;
    }

    async getSignedUrl(
        fileNanoid: string,
        userOrganizationUuid: string,
    ): Promise<string> {
        const file = await this.persistentDownloadFileModel.get(fileNanoid);

        if (userOrganizationUuid !== file.organization_uuid) {
            throw new ForbiddenError('You do not have access to this file');
        }

        return this.s3Client.getFileUrl(file.s3_key);
    }
}
