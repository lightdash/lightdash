import { subject } from '@casl/ability';
import {
    FeatureFlags,
    DbtProjectType,
    DbtProjectTypeLabels,
    ProjectType,
    type HomepageRecommendedActionKey,
} from '@lightdash/common';
import { type ReactNode } from 'react';
import { useGithubConfig } from '../../../../components/common/GithubIntegration/hooks/useGithubIntegration';
import { useGitlabRepositories } from '../../../../components/common/GitlabIntegration/hooks/useGitlabIntegration';
import {
    getWarehouseIcon,
    getWarehouseLabel,
} from '../../../../components/ProjectConnection/ProjectConnectFlow/utils';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useProject } from '../../../../hooks/useProject';
import { useProjects } from '../../../../hooks/useProjects';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { isPlaygroundProvisioningSource } from '../../../../utils/playgroundProject';
import { useActiveAgentOnboardingRun } from '../../agentOnboarding/hooks/useAgentOnboarding';
import { getAgentOnboardingRunUrl } from '../../agentOnboarding/utils';
import { useHomepageRecommendedActionSkips } from '../hooks/useHomepageRecommendedActionSkips';
import { RECOMMENDED_ACTION_KEYS } from './recommendedActionDefaults';

const DEFAULT_CTA_LABEL = 'Set up';

export type ActionStatus = {
    isVisible: boolean;
    isComplete: boolean;
    annotation: string | null;
    /** Replaces the default icon once the action is complete */
    doneIcon: ReactNode | null;
    url: string;
    ctaLabel: string;
};

const useActionStatuses = (
    projectUuid: string | null,
): {
    statuses: Record<HomepageRecommendedActionKey, ActionStatus>;
    isLoading: boolean;
} => {
    const { health } = useApp();
    const organizationQuery = useOrganization();
    const projectQuery = useProject(projectUuid ?? undefined);
    const projectsQuery = useProjects();
    const githubConfigQuery = useGithubConfig();
    const slackQuery = useGetSlack();
    const { data: organization } = organizationQuery;
    const { data: project } = projectQuery;
    const { data: projects } = projectsQuery;
    const { data: githubConfig } = githubConfigQuery;
    const { data: slack, isSuccess: isSlackSuccess } = slackQuery;
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const codingAgentOnboardingFlag = useServerFeatureFlag(
        FeatureFlags.CodingAgentOnboarding,
    );
    const hasAgentSemanticLayerEntry =
        newOnboardingFlag.data?.enabled === true &&
        codingAgentOnboardingFlag.data?.enabled === true;

    // An agent run left mid-flight is resumable, so the step points at the run
    // instead of restarting the flow
    const activeAgentRunQuery = useActiveAgentOnboardingRun(
        projectUuid ?? undefined,
        { enabled: hasAgentSemanticLayerEntry },
    );
    const activeAgentRun = activeAgentRunQuery.data ?? null;

    const hasGithub = !!health.data?.hasGithub;
    const hasGitlab = !!health.data?.hasGitlab;
    const gitlabQuery = useGitlabRepositories({
        enabled: hasGitlab,
    });
    const { isSuccess: isGitlabConnected } = gitlabQuery;
    const isGithubConnected = githubConfig?.enabled === true;

    // Every step defaults to incomplete, so rendering before these have
    // settled flashes steps that are already done
    const isLoading =
        health.isInitialLoading ||
        organizationQuery.isInitialLoading ||
        projectQuery.isInitialLoading ||
        projectsQuery.isInitialLoading ||
        (hasGithub && githubConfigQuery.isInitialLoading) ||
        (hasGitlab && gitlabQuery.isInitialLoading) ||
        activeAgentRunQuery.isInitialLoading ||
        (!!health.data?.hasSlack && slackQuery.isInitialLoading);

    const dbtConnection = project?.dbtConnection;
    const hasSemanticLayer =
        !!dbtConnection && dbtConnection.type !== DbtProjectType.NONE;
    const isSlackConnected =
        isSlackSuccess && !!slack && slack.hasRequiredScopes !== false;

    // A playground is a project, so `needsProject` alone would report the
    // warehouse step as done on sample data
    const hasRealWarehouseProject =
        organization?.needsProject === false &&
        (projects?.some(
            ({ type, provisioningSource }) =>
                type === ProjectType.DEFAULT &&
                !isPlaygroundProvisioningSource(provisioningSource),
        ) ??
            false);
    const warehouseType =
        hasRealWarehouseProject &&
        !isPlaygroundProvisioningSource(project?.provisioningSource)
            ? project?.warehouseConnection?.type
            : undefined;

    return {
        isLoading,
        statuses: {
            'connect-warehouse': {
                isVisible: true,
                isComplete: hasRealWarehouseProject,
                annotation: warehouseType
                    ? getWarehouseLabel(warehouseType)
                    : null,
                doneIcon: warehouseType
                    ? getWarehouseIcon(warehouseType, 'sm')
                    : null,
                url: '/onboarding/data-source',
                ctaLabel: DEFAULT_CTA_LABEL,
            },
            'add-semantic-layer': {
                isVisible: !!projectUuid,
                isComplete: hasSemanticLayer,
                annotation: dbtConnection
                    ? DbtProjectTypeLabels[dbtConnection.type]
                    : null,
                doneIcon: null,
                url: activeAgentRun
                    ? getAgentOnboardingRunUrl(
                          activeAgentRun.agentOnboardingRunUuid,
                          activeAgentRun.projectUuid,
                      )
                    : hasAgentSemanticLayerEntry
                      ? `/projects/${projectUuid}/onboarding/agent`
                      : `/generalSettings/projectManagement/${projectUuid}/settings`,
                ctaLabel: activeAgentRun ? 'Resume' : DEFAULT_CTA_LABEL,
            },
            'connect-source-control': {
                isVisible: hasGithub || hasGitlab,
                isComplete:
                    isGithubConnected || isGitlabConnected || hasSemanticLayer,
                annotation: isGithubConnected
                    ? 'GitHub'
                    : isGitlabConnected
                      ? 'GitLab'
                      : hasSemanticLayer
                        ? DbtProjectTypeLabels[dbtConnection.type]
                        : null,
                doneIcon: null,
                url: '/onboarding/dbt',
                ctaLabel: DEFAULT_CTA_LABEL,
            },
            'connect-slack': {
                isVisible: !!health.data?.hasSlack,
                isComplete: isSlackConnected,
                annotation: slack?.slackTeamName ?? 'Connected',
                doneIcon: null,
                url: '/generalSettings/integrations',
                ctaLabel: DEFAULT_CTA_LABEL,
            },
        },
    };
};

export const useRecommendedActions = (projectUuid: string | null) => {
    const { user } = useApp();
    const { statuses, isLoading } = useActionStatuses(projectUuid);
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const { data: project } = useProject(projectUuid ?? undefined);
    const isPlaygroundProject = isPlaygroundProvisioningSource(
        project?.provisioningSource,
    );

    const canManageProject =
        user.data?.ability?.can(
            'manage',
            subject('Project', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid ?? undefined,
            }),
        ) ?? false;

    const {
        skippedActions = [],
        isLoading: skippedActionsLoading,
        skipAction,
        restoreAction,
    } = useHomepageRecommendedActionSkips(projectUuid, {
        enabled: canManageProject,
    });

    // The playground is a throwaway sample-data project — the setup checklist
    // has no place there, so nothing is offered and the block hides itself.
    const visibleActions = isPlaygroundProject
        ? []
        : RECOMMENDED_ACTION_KEYS.filter((key) => statuses[key].isVisible);
    const skippedActionKeys = new Set<string>(skippedActions);
    const hasPendingActions =
        newOnboardingFlag.data?.enabled === true &&
        !isLoading &&
        !skippedActionsLoading &&
        canManageProject &&
        visibleActions.some(
            (key) => !statuses[key].isComplete && !skippedActionKeys.has(key),
        );

    return {
        statuses,
        skippedActions,
        skipAction,
        restoreAction,
        visibleActions,
        hasPendingActions,
    };
};

export type RecommendedActionsState = ReturnType<typeof useRecommendedActions>;
