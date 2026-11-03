import {
    DbtProjectType,
    FeatureFlags,
    ForbiddenError,
    ProjectType,
    RequestMethod,
    type SessionUser,
} from '@lightdash/common';
import {
    type LightdashAnalytics,
    type OnboardingAgentAutoStartSkippedReason,
} from '../../../analytics/LightdashAnalytics';
import Logger from '../../../logging/logger';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { type OnboardingAgentService } from './OnboardingAgentService';

export type AutoStartOnboardingAgentRunArguments = {
    user: SessionUser;
    projectUuid: string;
    projectType: ProjectType;
    dbtProjectType: DbtProjectType;
    method: RequestMethod;
    provisioningSource: string | undefined;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    projectModel: Pick<ProjectModel, 'getAllByOrganizationUuid'>;
    onboardingAgentService: Pick<
        OnboardingAgentService,
        'getMissingInfrastructure' | 'createRun'
    >;
    analytics: Pick<LightdashAnalytics, 'track'>;
};

export const autoStartOnboardingAgentRun = async ({
    user,
    projectUuid,
    projectType,
    dbtProjectType,
    method,
    provisioningSource,
    featureFlagService,
    projectModel,
    onboardingAgentService,
    analytics,
}: AutoStartOnboardingAgentRunArguments): Promise<void> => {
    const { organizationUuid } = user;
    if (
        !organizationUuid ||
        projectType !== ProjectType.DEFAULT ||
        provisioningSource !== undefined ||
        method !== RequestMethod.WEB_APP ||
        dbtProjectType !== DbtProjectType.NONE
    ) {
        return;
    }

    const [newOnboarding, codingAgentOnboarding] = await Promise.all([
        featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.NewOnboarding,
        }),
        featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.CodingAgentOnboarding,
        }),
    ]);
    if (!newOnboarding.enabled) return;

    const trackSkipped = (reason: OnboardingAgentAutoStartSkippedReason) => {
        analytics.track({
            event: 'onboarding_agent.auto_start_skipped',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                reason,
            },
        });
    };

    if (!codingAgentOnboarding.enabled) {
        trackSkipped('coding_agent_onboarding_disabled');
        return;
    }

    const customerProjects = (
        await projectModel.getAllByOrganizationUuid(organizationUuid)
    ).filter(
        (project) =>
            project.type === ProjectType.DEFAULT && !project.provisioningSource,
    );
    if (
        customerProjects.length !== 1 ||
        customerProjects[0].projectUuid !== projectUuid
    ) {
        trackSkipped('not_first_project');
        return;
    }

    const missingInfrastructure =
        onboardingAgentService.getMissingInfrastructure();
    if (missingInfrastructure) {
        Logger.info(
            `Skipping onboarding agent auto-start for project ${projectUuid}: ${missingInfrastructure}`,
        );
        trackSkipped('infrastructure_missing');
        return;
    }

    try {
        const run = await onboardingAgentService.createRun({
            user,
            projectUuid,
        });
        analytics.track({
            event: 'onboarding_agent.auto_started',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                agentOnboardingRunId: run.agentOnboardingRunUuid,
            },
        });
    } catch (error) {
        if (!(error instanceof ForbiddenError)) throw error;
        trackSkipped('not_authorized');
    }
};
