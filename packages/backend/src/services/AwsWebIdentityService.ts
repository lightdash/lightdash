import { subject } from '@casl/ability';
import {
    Account,
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    AwsWebIdentity,
    AwsWebIdentityAudience,
    CreateAwsWebIdentityAudience,
    FeatureFlags,
    ForbiddenError,
    ProjectType,
} from '@lightdash/common';
import { AwsWebIdentityAudienceModel } from '../models/AwsWebIdentityAudienceModel';
import { type FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import { type AwsWebIdentityResolver } from '../utils/awsWebIdentity/AwsWebIdentityResolver';
import { AWS_WEB_IDENTITY_MESSAGES } from '../utils/awsWebIdentity/messages';
import { BaseService } from './BaseService';

type AwsWebIdentityServiceArguments = {
    featureFlagModel: FeatureFlagModel;
    awsWebIdentityAudienceModel: AwsWebIdentityAudienceModel;
    awsWebIdentityResolver: AwsWebIdentityResolver;
    projectModel: ProjectModel;
};

export class AwsWebIdentityService extends BaseService {
    private readonly featureFlagModel: FeatureFlagModel;

    private readonly awsWebIdentityAudienceModel: AwsWebIdentityAudienceModel;

    private readonly awsWebIdentityResolver: AwsWebIdentityResolver;

    private readonly projectModel: ProjectModel;

    constructor({
        featureFlagModel,
        awsWebIdentityAudienceModel,
        awsWebIdentityResolver,
        projectModel,
    }: AwsWebIdentityServiceArguments) {
        super();
        this.featureFlagModel = featureFlagModel;
        this.awsWebIdentityAudienceModel = awsWebIdentityAudienceModel;
        this.awsWebIdentityResolver = awsWebIdentityResolver;
        this.projectModel = projectModel;
    }

    private async assertEnabled(organizationUuid: string, userUuid: string) {
        const { enabled } = await this.featureFlagModel.get({
            user: { organizationUuid, userUuid },
            featureFlagId: FeatureFlags.AthenaWebIdentityAuth,
        });
        if (!enabled) {
            throw new ForbiddenError(AWS_WEB_IDENTITY_MESSAGES.notEnabled);
        }
    }

    /** This instance's identity, to put in a role's trust policy. */
    async getIdentity(account: Account): Promise<AwsWebIdentity> {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        await this.assertEnabled(
            account.organization.organizationUuid,
            account.user.userUuid,
        );
        return {
            subject: (await this.awsWebIdentityResolver.getSubject()) ?? null,
        };
    }

    // Requires editing the project, or creating one when there's no project yet.
    async createAudience(
        account: Account,
        { projectUuid }: CreateAwsWebIdentityAudience,
    ): Promise<AwsWebIdentityAudience> {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        await this.assertEnabled(
            account.organization.organizationUuid,
            account.user.userUuid,
        );
        const { organizationUuid } = account.organization;
        const ability = this.createAuditedAbility(account);
        if (projectUuid) {
            const project = await this.projectModel.getSummary(projectUuid);
            if (
                project.organizationUuid !== organizationUuid ||
                ability.cannot(
                    'update',
                    subject('Project', {
                        organizationUuid: project.organizationUuid,
                        projectUuid: project.projectUuid,
                        upstreamProjectUuid: project.upstreamProjectUuid,
                        type: project.type,
                        createdByUserUuid: project.createdByUserUuid,
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        } else if (
            [ProjectType.DEFAULT, ProjectType.PREVIEW].every((type) =>
                ability.cannot(
                    'create',
                    subject('Project', { organizationUuid, type }),
                ),
            )
        ) {
            throw new ForbiddenError();
        }
        const audience = await this.awsWebIdentityAudienceModel.create(
            account.organization.organizationUuid,
            account.user.userUuid,
        );
        return {
            audience,
            subject: (await this.awsWebIdentityResolver.getSubject()) ?? null,
        };
    }
}
