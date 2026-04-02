import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    type SessionUser,
    type VerifiedContentListItem,
} from '@lightdash/common';
import { ContentVerificationModel } from '../models/ContentVerificationModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { BaseService } from './BaseService';
import { FeatureFlagService } from './FeatureFlag/FeatureFlagService';

type ContentVerificationServiceArguments = {
    contentVerificationModel: ContentVerificationModel;
    projectModel: ProjectModel;
    featureFlagService: FeatureFlagService;
};

export class ContentVerificationService extends BaseService {
    private readonly contentVerificationModel: ContentVerificationModel;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagService: FeatureFlagService;

    constructor({
        contentVerificationModel,
        projectModel,
        featureFlagService,
    }: ContentVerificationServiceArguments) {
        super({ serviceName: 'ContentVerificationService' });
        this.contentVerificationModel = contentVerificationModel;
        this.projectModel = projectModel;
        this.featureFlagService = featureFlagService;
    }

    private async assertContentVerificationEnabled(
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<void> {
        const flag = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.ContentVerification,
        });
        if (!flag.enabled) {
            throw new ForbiddenError('Content verification is not enabled');
        }
    }

    async listVerifiedContent(
        user: SessionUser,
        projectUuid: string,
    ): Promise<VerifiedContentListItem[]> {
        await this.assertContentVerificationEnabled(user);
        const project = await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentVerification', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                    uuid: projectUuid,
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
