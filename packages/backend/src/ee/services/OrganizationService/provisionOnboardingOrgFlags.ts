import { FeatureFlags, type SessionUser } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    type CodingAgentOnboardingEnablement,
    type HomepageBuilderEnablement,
    type LightdashAnalytics,
} from '../../../analytics/LightdashAnalytics';
import Logger from '../../../logging/logger';
import { type FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';

export type ProvisionOnboardingOrgFlagsArguments = {
    user: SessionUser;
    organizationUuid: string;
    featureFlagService: Pick<
        FeatureFlagService,
        'get' | 'ensureOrganizationOverrideEnabled'
    >;
    analytics: Pick<LightdashAnalytics, 'track'>;
};

export const provisionOnboardingOrgFlags = async ({
    user,
    organizationUuid,
    featureFlagService,
    analytics,
}: ProvisionOnboardingOrgFlagsArguments): Promise<void> => {
    const newOnboardingFlag = await featureFlagService.get({
        user,
        featureFlagId: FeatureFlags.NewOnboarding,
    });
    if (!newOnboardingFlag.enabled) {
        return;
    }

    const homepageBuilderEnablement: HomepageBuilderEnablement = 'enabled';

    let codingAgentOnboardingEnablement: CodingAgentOnboardingEnablement;
    try {
        codingAgentOnboardingEnablement =
            await featureFlagService.ensureOrganizationOverrideEnabled({
                user,
                featureFlagId: FeatureFlags.CodingAgentOnboarding,
            });
    } catch (error) {
        Sentry.captureException(error);
        Logger.error(
            `Failed to enable coding agent onboarding for organization ${organizationUuid}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        codingAgentOnboardingEnablement = 'failed';
    }

    analytics.track({
        event: 'onboarding_org_flags.provisioned',
        userId: user.userUuid,
        properties: {
            organizationId: organizationUuid,
            onboardingFlow: 'new',
            homepageBuilderEnablement,
            codingAgentOnboardingEnablement,
        },
    });
};
