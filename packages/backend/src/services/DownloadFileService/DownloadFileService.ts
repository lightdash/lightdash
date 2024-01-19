import { subject } from '@casl/ability';
import {
    DownloadFile,
    DownloadFileType,
    ForbiddenError,
    isUserWithOrg,
    NotFoundError,
    SessionUser,
    ShareUrl,
} from '@lightdash/common';
import fs from 'fs';
import { nanoid as nanoidGenerator } from 'nanoid';
import { analytics } from '../../analytics/client';
import { LightdashConfig } from '../../config/parseConfig';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { ShareModel } from '../../models/ShareModel';

type Dependencies = {
    downloadFileModel: DownloadFileModel;
    lightdashConfig: Pick<LightdashConfig, 's3'>;
};

export class DownloadFileService {
    private readonly lightdashConfig: Pick<LightdashConfig, 's3'>;

    private readonly downloadFileModel: DownloadFileModel;

    constructor(dependencies: Dependencies) {
        this.lightdashConfig = dependencies.lightdashConfig;
        this.downloadFileModel = dependencies.downloadFileModel;
    }

    private isS3Enabled = () =>
        this.lightdashConfig.s3?.endpoint && this.lightdashConfig.s3.region;

    async getDownloadFile(nanoid: string): Promise<DownloadFile> {
        if (this.isS3Enabled()) {
            throw new ForbiddenError(
                'Downloading files is not available if S3 is enabled',
            );
        }

        const file = await this.downloadFileModel.getDownloadFile(nanoid);

        if (!fs.existsSync(file.path)) {
            const error = `This file ${file.path} doesn't exist on this server, this may be happening if you are running multiple containers or because files are not persisted. You can check out our docs to learn more on how to enable cloud storage: https://docs.lightdash.com/self-host/customize-deployment/configure-lightdash-to-use-external-object-storage`;
            throw new NotFoundError(error);
        }
        return file;
    }
}
