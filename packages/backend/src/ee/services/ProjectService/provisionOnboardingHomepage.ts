import {
    buildOnboardingHomepageConfig,
    FeatureFlags,
    isOrgHomepageEnabled,
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
    provisioningSource?: 'playground' | 'training' | 'analytics';
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    projectModel: Pick<ProjectModel, 'getAllByOrganizationUuid'>;
    projectHomepageModel: Pick<
        ProjectHomepageModel,
        'list' | 'create' | 'publish' | 'findOrgHomepageSettings'
    >;
    analytics: Pick<LightdashAnalytics, 'track'>;
};

export const provisionOnboardingHomepage = async ({
    user,
    projectUuid,
    projectType,
    provisioningSource,
    featureFlagService,
    projectModel,
    projectHomepageModel,
    analytics,
}: ProvisionOnboardingHomepageArguments): Promise<void> => {
    const { organizationUuid } = user;
    if (projectType !== ProjectType.DEFAULT || !organizationUuid) {
        return;
    }

    const orgSetupPageFlag = await featureFlagService.get({
        user,
        featureFlagId: FeatureFlags.NewOnboarding,
    });
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

    try {
        const organizationProjects =
            await projectModel.getAllByOrganizationUuid(organizationUuid);
        const isPlayground = provisioningSource === 'playground';
        if (
            !isPlayground &&
            (organizationProjects.length !== 1 ||
                organizationProjects[0].projectUuid !== projectUuid)
        ) {
            trackSkipped('not_first_project');
            return;
        }

        // An org that switched back to the classic homepage shouldn't get
        // a homepage minted for its new projects.
        const orgHomepageSettings =
            await projectHomepageModel.findOrgHomepageSettings(
                organizationUuid,
            );
        if (!isOrgHomepageEnabled(orgHomepageSettings)) {
            trackSkipped('homepage_disabled');
            return;
        }

        const existingHomepages = await projectHomepageModel.list(projectUuid);
        if (existingHomepages.length > 0) {
            trackSkipped('homepage_already_exists');
            return;
        }

        // An org that chose a content-first opening shouldn't get an
        // AI-first homepage either.
        const homepage = await projectHomepageModel.create({
            projectUuid,
            name: 'Getting started',
            draftConfig: buildOnboardingHomepageConfig(
                orgHomepageSettings?.opening === 'content-first'
                    ? 'content-first'
                    : 'ask-first',
            ),
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
