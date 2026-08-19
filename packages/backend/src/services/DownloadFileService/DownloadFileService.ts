import { subject } from '@casl/ability';
import {
    DownloadFile,
    ForbiddenError,
    NotFoundError,
    type Account,
} from '@lightdash/common';
import fs from 'fs';
import { LightdashConfig } from '../../config/parseConfig';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';

type DownloadFileServiceArguments = {
    downloadFileModel: DownloadFileModel;
    lightdashConfig: Pick<LightdashConfig, 's3'>;
    projectModel: ProjectModel;
};

export class DownloadFileService extends BaseService {
    private readonly lightdashConfig: Pick<LightdashConfig, 's3'>;

    private readonly downloadFileModel: DownloadFileModel;

    private readonly projectModel: ProjectModel;

    constructor(args: DownloadFileServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.downloadFileModel = args.downloadFileModel;
        this.projectModel = args.projectModel;
    }

    private isS3Enabled = () =>
        this.lightdashConfig.s3?.endpoint && this.lightdashConfig.s3.region;

    private assertLocalDownloadsEnabled() {
        if (this.isS3Enabled()) {
            throw new ForbiddenError(
                'Downloading files is not available if S3 is enabled',
            );
        }
    }

    private assertFileExists(file: DownloadFile) {
        if (!fs.existsSync(file.path)) {
            const error = `This file ${file.path} doesn't exist on this server, this may be happening if you are running multiple containers or because files are not persisted. You can check out our docs to learn more on how to enable cloud storage: https://docs.lightdash.com/self-host/customize-deployment/configure-lightdash-to-use-external-object-storage`;
            throw new NotFoundError(error);
        }
    }

    async getDownloadFile(nanoid: string): Promise<DownloadFile> {
        this.assertLocalDownloadsEnabled();
        const file = await this.downloadFileModel.getDownloadFile(nanoid);
        this.assertFileExists(file);
        return file;
    }

    async getDownloadFileForProject(
        account: Account,
        projectUuid: string,
        nanoid: string,
    ): Promise<DownloadFile> {
        this.assertLocalDownloadsEnabled();

        const project = await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'view',
                subject('Project', project),
            )
        ) {
            throw new ForbiddenError();
        }

        const file = await this.downloadFileModel.getDownloadFileForProject(
            projectUuid,
            nanoid,
        );

        this.assertFileExists(file);
        return file;
    }
}
