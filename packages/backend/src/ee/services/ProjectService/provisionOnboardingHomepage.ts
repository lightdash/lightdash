import {
    buildOnboardingHomepageConfig,
    CommercialFeatureFlags,
    FeatureFlags,
    ProjectType,
    type SessionUser,
} from '@lightdash/common';
import {
    type LightdashAnalytics,
    type OnboardingFlow,
    type OnboardingHomepageSkippedReason,
} from '../../../analytics/LightdashAnalytics';
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
    analytics: Pick<LightdashAnalytics, 'track'>;
};

export const provisionOnboardingHomepage = async ({
    user,
    projectUuid,
    projectType,
    featureFlagService,
    projectModel,
    projectHomepageModel,
    analytics,
}: ProvisionOnboardingHomepageArguments): Promise<void> => {
    const { organizationUuid } = user;
    if (projectType !== ProjectType.DEFAULT || !organizationUuid) {
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
    const onboardingFlow: OnboardingFlow = orgSetupPageFlag.enabled
        ? 'new'
        : 'legacy';
    const trackSkipped = (reason: OnboardingHomepageSkippedReason) => {
        analytics.track({
            event: 'onboarding_homepage.skipped',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                onboardingFlow,
                reason,
            },
        });
    };
    if (!orgSetupPageFlag.enabled) {
        trackSkipped('new_onboarding_flag_disabled');
        return;
    }
    if (!homepageBuilderFlag.enabled) {
        trackSkipped('homepage_builder_flag_disabled');
        return;
    }

    try {
        const organizationProjects =
            await projectModel.getAllByOrganizationUuid(organizationUuid);
        if (
            organizationProjects.length !== 1 ||
            organizationProjects[0].projectUuid !== projectUuid
        ) {
            trackSkipped('not_first_project');
            return;
        }

        const existingHomepages = await projectHomepageModel.list(projectUuid);
        if (existingHomepages.length > 0) {
            trackSkipped('homepage_already_exists');
            return;
        }

        const homepage = await projectHomepageModel.create({
            projectUuid,
            name: 'Getting started',
            draftConfig: buildOnboardingHomepageConfig(),
            createdByUserUuid: user.userUuid,
        });
        await projectHomepageModel.publish(homepage.homepageUuid, {
            type: 'everyone',
        });
        analytics.track({
            event: 'onboarding_homepage.provisioned',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                homepageUuid: homepage.homepageUuid,
                onboardingFlow,
            },
        });
    } catch (error) {
        analytics.track({
            event: 'onboarding_homepage.failed',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                onboardingFlow,
                errorType: error instanceof Error ? error.name : 'Unknown',
            },
        });
        throw error;
    }
};
