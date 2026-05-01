import { subject } from '@casl/ability';
import {
    ForbiddenError,
    type RegisteredAccount,
    type VerifiedContentListItem,
} from '@lightdash/common';
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
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<VerifiedContentListItem[]> {
        const project = await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);

        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentVerification', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                    metadata: { projectUuid },
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
