import {
    ForbiddenError,
    type SessionUser,
    type VerifiedContentListItem,
} from '@lightdash/common';
import { subject } from '@casl/ability';
import { ContentVerificationModel } from '../models/ContentVerificationModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { BaseService } from './BaseService';

type ContentVerificationServiceArguments = {
    contentVerificationModel: ContentVerificationModel;
    projectModel: ProjectModel;
};

export class ContentVerificationService extends BaseService {
    private readonly contentVerificationModel: ContentVerificationModel;

    private readonly projectModel: ProjectModel;

    constructor({
        contentVerificationModel,
        projectModel,
    }: ContentVerificationServiceArguments) {
        super({ serviceName: 'ContentVerificationService' });
        this.contentVerificationModel = contentVerificationModel;
        this.projectModel = projectModel;
    }

    async listVerifiedContent(
        user: SessionUser,
        projectUuid: string,
    ): Promise<VerifiedContentListItem[]> {
        const project = await this.projectModel.getSummary(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('ContentVerification', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view verified content',
            );
        }

        return this.contentVerificationModel.getAllForProject(projectUuid);
    }
}
