import {
    ExploreType,
    FeatureFlags,
    isAgentOnboardingRunTerminal,
    isSummaryExploreError,
    type DashboardBasicDetails,
    type SummaryExplore,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocalStorage } from 'react-use';
import { useExternalConnections } from '../../../../../features/externalConnections/hooks/useExternalConnections';
import { useExternalSources } from '../../../../../features/externalSources/hooks/useExternalSources';
import { useDashboards } from '../../../../../hooks/dashboard/useDashboards';
import { useOrganizationBrand } from '../../../../../hooks/organization/useOrganizationBrand';
import { useExplores } from '../../../../../hooks/useExplores';
import { useOrganizationUsers } from '../../../../../hooks/useOrganizationUsers';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import { useSpaceSummaries } from '../../../../../hooks/useSpaces';
import useApp from '../../../../../providers/App/useApp';
import {
    useActiveAgentOnboardingRun,
    useAgentOnboardingRun,
} from '../../../agentOnboarding/hooks/useAgentOnboarding';
import { useCanManageProject } from '../../hooks/useHomepageAbilities';
import { type RecommendedActionsState } from '../useRecommendedActions';
import { buildSetupGuide } from './setupGuideModel';

const STARTER_SPACE_SLUG = 'lightdash-starter';

const latestDashboard = (dashboards: DashboardBasicDetails[]) =>
    dashboards.reduce<DashboardBasicDetails | null>(
        (latest, dashboard) =>
            latest === null ||
            new Date(dashboard.updatedAt) > new Date(latest.updatedAt)
                ? dashboard
                : latest,
        null,
    );

// The agent run drafts into the starter space; any newest dashboard stands in otherwise
const starterDashboard = (
    dashboards: DashboardBasicDetails[],
    starterSpaceUuid: string | undefined,
) =>
    latestDashboard(
        dashboards.filter(({ spaceUuid }) => spaceUuid === starterSpaceUuid),
    ) ?? latestDashboard(dashboards);

// Matches hasSemanticLayerExplore in common: compiled DEFAULT or untyped explores
const countSemanticModels = (explores: SummaryExplore[]) =>
    explores.filter(
        (explore) =>
            !isSummaryExploreError(explore) &&
            (explore.type === undefined ||
                explore.type === ExploreType.DEFAULT),
    ).length;

export const useSetupGuide = (
    projectUuid: string,
    actions: RecommendedActionsState,
) => {
    const { user } = useApp();
    const userUuid = user.data?.userUuid;
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const canManageProject = useCanManageProject(projectUuid);
    // visibleActions is empty on the playground, where setup has no place
    const isEligible =
        newOnboardingFlag.data?.enabled === true &&
        canManageProject &&
        actions.visibleActions.length > 0;
    const enabled = { enabled: isEligible };

    const explores = useExplores(projectUuid, true, false, enabled);
    const activeRun = useActiveAgentOnboardingRun(projectUuid, enabled);
    // The active-run lookup does not poll, so the run itself is watched for completion
    const watchedRun = useAgentOnboardingRun(
        projectUuid,
        activeRun.data?.agentOnboardingRunUuid,
        enabled,
    );
    const run = watchedRun.data ?? activeRun.data ?? null;
    const isRunTerminal = !!run && isAgentOnboardingRunTerminal(run.status);
    const queryClient = useQueryClient();
    useEffect(() => {
        if (!isRunTerminal) return;
        void queryClient.invalidateQueries({
            queryKey: ['tables', projectUuid],
        });
        void queryClient.invalidateQueries({
            queryKey: ['dashboards', projectUuid],
        });
    }, [isRunTerminal, projectUuid, queryClient]);
    // These hooks take no enabled option; an undefined project keeps them idle
    const gatedProjectUuid = isEligible ? projectUuid : undefined;
    const connections = useExternalConnections(gatedProjectUuid);
    const sources = useExternalSources(gatedProjectUuid);
    const dashboards = useDashboards(projectUuid, enabled);
    const spaces = useSpaceSummaries(projectUuid, true, enabled);
    const brand = useOrganizationBrand(enabled);
    const users = useOrganizationUsers(enabled);

    // ponytail: dismissal is per user and project in localStorage, the server skip table only accepts checklist keys
    const [isDismissed, setIsDismissed] = useLocalStorage(
        `homepage-setup-guide-dismissed-${userUuid ?? 'anon'}-${projectUuid}`,
        false,
    );

    // Hold a slot while eligibility resolves so the guide doesn't push the page down
    const isLoading =
        newOnboardingFlag.data?.enabled !== false &&
        canManageProject &&
        (newOnboardingFlag.isInitialLoading ||
            actions.isLoading ||
            [explores, activeRun, dashboards, brand].some(
                (query) => query.isInitialLoading,
            ));

    const sections = buildSetupGuide({
        projectUuid,
        statuses: actions.statuses,
        visibleActions: actions.visibleActions,
        skippedActions: actions.skippedActions,
        semanticModelCount: countSemanticModels(explores.data ?? []),
        activeRun: run && !isRunTerminal ? run : null,
        appSourceNames: [
            ...(connections.data ?? [])
                .filter(({ kind }) => kind === 'live_source')
                .map(({ name }) => name),
            ...(sources.data ?? []).map(({ name }) => name),
        ],
        starterDashboard: starterDashboard(
            dashboards.data ?? [],
            spaces.data?.find(({ slug }) => slug === STARTER_SPACE_SLUG)?.uuid,
        ),
        brand: brand.data ?? null,
        teammateCount: (users.data ?? []).filter(
            (member) => member.userUuid !== userUuid,
        ).length,
    });

    return {
        isEligible,
        isLoading,
        sections,
        isDismissed: isDismissed === true,
        setIsDismissed: (next: boolean) => setIsDismissed(next),
        skipAction: actions.skipAction,
        restoreAction: actions.restoreAction,
    };
};

export type SetupGuideState = ReturnType<typeof useSetupGuide>;
