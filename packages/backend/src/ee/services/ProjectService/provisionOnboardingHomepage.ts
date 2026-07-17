import {
    buildOnboardingHomepageConfig,
    CommercialFeatureFlags,
    FeatureFlags,
    ProjectType,
    type SessionUser,
} from '@lightdash/common';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { type ProjectHomepageModel } from '../../models/ProjectHomepageModel';

export type ProvisionOnboardingHomepageArguments = {
    user: SessionUser;
    projectUuid: string;
    projectType: ProjectType;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    projectModel: Pick<ProjectModel, 'getAllByOrganizationUuid'>;
    projectHomepageModel: Pick<
        ProjectHomepageModel,
        'list' | 'create' | 'publish'
    >;
};

export const provisionOnboardingHomepage = async ({
    user,
    projectUuid,
    projectType,
    featureFlagService,
    projectModel,
    projectHomepageModel,
}: ProvisionOnboardingHomepageArguments): Promise<void> => {
    if (projectType !== ProjectType.DEFAULT || !user.organizationUuid) {
        return;
    }

    const [orgSetupPageFlag, homepageBuilderFlag] = await Promise.all([
        featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.NewOnboarding,
        }),
        featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.HomepageBuilder,
        }),
    ]);
    if (!orgSetupPageFlag.enabled || !homepageBuilderFlag.enabled) {
        return;
    }

    const organizationProjects = await projectModel.getAllByOrganizationUuid(
        user.organizationUuid,
    );
    if (
        organizationProjects.length !== 1 ||
        organizationProjects[0].projectUuid !== projectUuid
    ) {
        return;
    }

    const existingHomepages = await projectHomepageModel.list(projectUuid);
    if (existingHomepages.length > 0) {
        return;
    }

    const homepage = await projectHomepageModel.create({
        projectUuid,
        name: 'Getting started',
        draftConfig: buildOnboardingHomepageConfig(),
        createdByUserUuid: user.userUuid,
    });
    await projectHomepageModel.publish(
        homepage.homepageUuid,
        { type: 'everyone' },
        true,
    );
};
