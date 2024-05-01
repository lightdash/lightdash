import { DownloadFile, ForbiddenError, NotFoundError } from '@lightdash/common';
import fs from 'fs';
import { LightdashConfig } from '../../config/parseConfig';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { BaseService } from '../BaseService';

type DownloadFileServiceArguments = {
    downloadFileModel: DownloadFileModel;
    lightdashConfig: Pick<LightdashConfig, 's3' | 'siteHelpdeskUrl'>;
};

export class DownloadFileService extends BaseService {
    private readonly lightdashConfig: Pick<
        LightdashConfig,
        's3' | 'siteHelpdeskUrl'
    >;

    private readonly downloadFileModel: DownloadFileModel;

    constructor(args: DownloadFileServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.downloadFileModel = args.downloadFileModel;
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
            const error = `This file ${file.path} doesn't exist on this server, this may be happening if you are running multiple containers or because files are not persisted. You can check out our docs to learn more on how to enable cloud storage: ${this.lightdashConfig.siteHelpdeskUrl}/self-host/customize-deployment/configure-lightdash-to-use-external-object-storage`;
            throw new NotFoundError(error);
        }
        return file;
    }
}
