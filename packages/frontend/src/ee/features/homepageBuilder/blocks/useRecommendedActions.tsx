import {
    FeatureFlags,
    DbtProjectType,
    DbtProjectTypeLabels,
    ProjectType,
    type AgentOnboardingRun,
    type HealthState,
    type HomepageRecommendedActionKey,
    type Organization,
    type OrganizationProject,
    type Project,
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
import { useCanManageProject } from '../hooks/useHomepageAbilities';
import { useHomepageRecommendedActionSkips } from '../hooks/useHomepageRecommendedActionSkips';
import { RECOMMENDED_ACTION_KEYS } from './recommendedActionDefaults';

const DEFAULT_CTA_LABEL = 'Set up';

// A query whose `enabled` comes from another query's answer sits idle — not
// loading, not resolved — until that answer lands, and an idle query reports
// exactly the same `isInitialLoading` as a finished one. Reading idle as
// settled is what makes readiness go ready → not ready → ready as each gate
// opens. A term is instead pending until its gate is known, and then until the
// query it gates has come back; a closed gate rules the term out for good, so
// the predicate can only ever travel pending → settled.
const isTermPending = (
    isGateOpen: boolean | undefined,
    query: { isFetched: boolean },
) => isGateOpen === undefined || (isGateOpen && !query.isFetched);

type GatedQuery = readonly [
    isGateOpen: boolean | undefined,
    query: { isFetched: boolean },
];

const isAnyTermPending = (terms: GatedQuery[]): boolean =>
    terms.some(([isGateOpen, query]) => isTermPending(isGateOpen, query));

// A gate is unknown until the query that decides it has settled.
const gate = (isSettled: boolean, isOpen: boolean): boolean | undefined =>
    isSettled ? isOpen : undefined;

const isFlagOn = (flag: { data: { enabled: boolean } | undefined }): boolean =>
    flag.data?.enabled === true;

const integrationFlags = (health: HealthState | undefined) => ({
    hasGithub: !!health?.hasGithub,
    hasGitlab: !!health?.hasGitlab,
    hasSlack: !!health?.hasSlack,
});

type DbtConnection = Project['dbtConnection'] | undefined;

const hasSemanticLayer = (dbtConnection: DbtConnection): boolean =>
    !!dbtConnection && dbtConnection.type !== DbtProjectType.NONE;

export type ActionStatus = {
    isVisible: boolean;
    isComplete: boolean;
    annotation: string | null;
    /** Replaces the default icon once the action is complete */
    doneIcon: ReactNode | null;
    url: string;
    ctaLabel: string;
};

// A playground is a project, so `needsProject` alone would report the
// warehouse step as done on sample data
const resolveWarehouse = (
    organization: Organization | undefined,
    projects: OrganizationProject[] | undefined,
    project: Project | undefined,
) => {
    const hasRealWarehouseProject =
        organization?.needsProject === false &&
        (projects ?? []).some(
            ({ type, provisioningSource }) =>
                type === ProjectType.DEFAULT &&
                !isPlaygroundProvisioningSource(provisioningSource),
        );
    const warehouseType =
        hasRealWarehouseProject &&
        !isPlaygroundProvisioningSource(project?.provisioningSource)
            ? project?.warehouseConnection?.type
            : undefined;
    return { hasRealWarehouseProject, warehouseType };
};

const warehouseStatus = ({
    hasRealWarehouseProject,
    warehouseType,
}: ReturnType<typeof resolveWarehouse>): ActionStatus => ({
    isVisible: true,
    isComplete: hasRealWarehouseProject,
    annotation: warehouseType ? getWarehouseLabel(warehouseType) : null,
    doneIcon: warehouseType ? getWarehouseIcon(warehouseType, 'sm') : null,
    url: '/onboarding/data-source',
    ctaLabel: DEFAULT_CTA_LABEL,
});

// An agent run left mid-flight is resumable, so the step points at the run
// instead of restarting the flow
const semanticLayerUrl = (
    projectUuid: string | null,
    activeAgentRun: AgentOnboardingRun | null,
    hasAgentSemanticLayerEntry: boolean,
): string => {
    if (activeAgentRun) {
        return getAgentOnboardingRunUrl(
            activeAgentRun.agentOnboardingRunUuid,
            activeAgentRun.projectUuid,
        );
    }
    if (hasAgentSemanticLayerEntry) {
        return `/projects/${projectUuid}/onboarding/agent`;
    }
    return `/generalSettings/projectManagement/${projectUuid}/settings`;
};

const semanticLayerStatus = ({
    projectUuid,
    dbtConnection,
    activeAgentRun,
    hasAgentSemanticLayerEntry,
}: {
    projectUuid: string | null;
    dbtConnection: DbtConnection;
    activeAgentRun: AgentOnboardingRun | null;
    hasAgentSemanticLayerEntry: boolean;
}): ActionStatus => ({
    isVisible: !!projectUuid,
    isComplete: hasSemanticLayer(dbtConnection),
    annotation: dbtConnection ? DbtProjectTypeLabels[dbtConnection.type] : null,
    doneIcon: null,
    url: semanticLayerUrl(
        projectUuid,
        activeAgentRun,
        hasAgentSemanticLayerEntry,
    ),
    ctaLabel: activeAgentRun ? 'Resume' : DEFAULT_CTA_LABEL,
});

const sourceControlAnnotation = (
    isGithubConnected: boolean,
    isGitlabConnected: boolean,
    dbtConnection: DbtConnection,
): string | null => {
    if (isGithubConnected) return 'GitHub';
    if (isGitlabConnected) return 'GitLab';
    if (dbtConnection && dbtConnection.type !== DbtProjectType.NONE) {
        return DbtProjectTypeLabels[dbtConnection.type];
    }
    return null;
};

const sourceControlStatus = ({
    hasGithub,
    hasGitlab,
    isGithubConnected,
    isGitlabConnected,
    dbtConnection,
}: {
    hasGithub: boolean;
    hasGitlab: boolean;
    isGithubConnected: boolean;
    isGitlabConnected: boolean;
    dbtConnection: DbtConnection;
}): ActionStatus => ({
    isVisible: hasGithub || hasGitlab,
    isComplete:
        isGithubConnected ||
        isGitlabConnected ||
        hasSemanticLayer(dbtConnection),
    annotation: sourceControlAnnotation(
        isGithubConnected,
        isGitlabConnected,
        dbtConnection,
    ),
    doneIcon: null,
    url: '/onboarding/dbt',
    ctaLabel: DEFAULT_CTA_LABEL,
});

const slackStatus = (
    hasSlack: boolean,
    slackQuery: ReturnType<typeof useGetSlack>,
): ActionStatus => {
    const { data: slack, isSuccess } = slackQuery;
    return {
        isVisible: hasSlack,
        isComplete: isSuccess && !!slack && slack.hasRequiredScopes !== false,
        annotation: slack?.slackTeamName ?? 'Connected',
        doneIcon: null,
        url: '/generalSettings/integrations',
        ctaLabel: DEFAULT_CTA_LABEL,
    };
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
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const codingAgentOnboardingFlag = useServerFeatureFlag(
        FeatureFlags.CodingAgentOnboarding,
    );
    const areFlagsSettled =
        newOnboardingFlag.isFetched && codingAgentOnboardingFlag.isFetched;
    const hasAgentSemanticLayerEntry =
        isFlagOn(newOnboardingFlag) && isFlagOn(codingAgentOnboardingFlag);

    const activeAgentRunQuery = useActiveAgentOnboardingRun(
        projectUuid ?? undefined,
        { enabled: hasAgentSemanticLayerEntry },
    );
    const activeAgentRun = activeAgentRunQuery.data ?? null;

    const isHealthSettled = health.isFetched;
    const { hasGithub, hasGitlab, hasSlack } = integrationFlags(health.data);
    const gitlabQuery = useGitlabRepositories({
        enabled: hasGitlab,
    });
    const isGithubConnected = githubConfigQuery.data?.enabled === true;

    // Every step defaults to incomplete, so rendering before these have
    // settled flashes steps that are already done. Health decides which
    // integrations are even in play and the flags decide whether the agent run
    // is looked up, so those answers gate the terms below rather than each
    // query's own idle state.
    const isLoading =
        !areFlagsSettled ||
        isAnyTermPending([
            [true, health],
            [true, organizationQuery],
            [!!projectUuid, projectQuery],
            [true, projectsQuery],
            [gate(isHealthSettled, hasGithub), githubConfigQuery],
            [gate(isHealthSettled, hasGitlab), gitlabQuery],
            [gate(isHealthSettled, hasSlack), slackQuery],
            [
                gate(
                    areFlagsSettled,
                    !!projectUuid && hasAgentSemanticLayerEntry,
                ),
                activeAgentRunQuery,
            ],
        ]);

    const dbtConnection = projectQuery.data?.dbtConnection;

    return {
        isLoading,
        statuses: {
            'connect-warehouse': warehouseStatus(
                resolveWarehouse(
                    organizationQuery.data,
                    projectsQuery.data,
                    projectQuery.data,
                ),
            ),
            'add-semantic-layer': semanticLayerStatus({
                projectUuid,
                dbtConnection,
                activeAgentRun,
                hasAgentSemanticLayerEntry,
            }),
            'connect-source-control': sourceControlStatus({
                hasGithub,
                hasGitlab,
                isGithubConnected,
                isGitlabConnected: gitlabQuery.isSuccess,
                dbtConnection,
            }),
            'connect-slack': slackStatus(hasSlack, slackQuery),
        },
    };
};

export const useRecommendedActions = (projectUuid: string | null) => {
    const { statuses, isLoading: areStatusesLoading } =
        useActionStatuses(projectUuid);
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const { data: project } = useProject(projectUuid ?? undefined);
    const isPlaygroundProject = isPlaygroundProvisioningSource(
        project?.provisioningSource,
    );
    const canManageProject = useCanManageProject(projectUuid);

    const {
        skippedActions = [],
        isLoading: skippedActionsLoading,
        skipAction,
        restoreAction,
    } = useHomepageRecommendedActionSkips(projectUuid, {
        enabled: canManageProject,
    });

    // Skips are the last thing the checklist needs, so they belong in the same
    // readiness answer — a caller that revealed on statuses alone would still
    // have the checklist arrive in a wave of its own.
    const isLoading = areStatusesLoading || skippedActionsLoading;

    // The playground is a throwaway sample-data project — the setup checklist
    // has no place there, so nothing is offered and the block hides itself.
    const visibleActions = isPlaygroundProject
        ? []
        : RECOMMENDED_ACTION_KEYS.filter((key) => statuses[key].isVisible);
    const skippedActionKeys = new Set<string>(skippedActions);
    const hasPendingActions =
        isFlagOn(newOnboardingFlag) &&
        !isLoading &&
        canManageProject &&
        visibleActions.some(
            (key) => !statuses[key].isComplete && !skippedActionKeys.has(key),
        );

    return {
        statuses,
        isLoading,
        skippedActions,
        skipAction,
        restoreAction,
        visibleActions,
        hasPendingActions,
    };
};

export type RecommendedActionsState = ReturnType<typeof useRecommendedActions>;
