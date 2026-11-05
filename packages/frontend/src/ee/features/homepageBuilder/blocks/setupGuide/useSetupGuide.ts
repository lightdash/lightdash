import { subject } from '@casl/ability';
import {
    ContentType,
    FeatureFlags,
    isAgentOnboardingRunTerminal,
    isSemanticLayerExplore,
} from '@lightdash/common';
import { useMatches } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocalStorage } from 'react-use';
import { useChartTypesEnabled } from '../../../../../features/chartTypes/hooks/useChartTypesEnabled';
import { useDataAppVisualizations } from '../../../../../features/chartTypes/hooks/useDataAppVisualizations';
import { useExternalConnections } from '../../../../../features/externalConnections/hooks/useExternalConnections';
import { useExternalSources } from '../../../../../features/externalSources/hooks/useExternalSources';
import { getSemanticStudioUrl } from '../../../../../features/semanticStudio/urls';
import { useOrganizationBrand } from '../../../../../hooks/organization/useOrganizationBrand';
import { useInfiniteContent } from '../../../../../hooks/useContent';
import { useExplores } from '../../../../../hooks/useExplores';
import { useOrganizationUsers } from '../../../../../hooks/useOrganizationUsers';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../../providers/App/useApp';
import {
    useActiveAgentOnboardingRun,
    useAgentOnboardingRun,
    useLatestAgentOnboardingRun,
} from '../../../agentOnboarding/hooks/useAgentOnboarding';
import { getAgentOnboardingRunUrl } from '../../../agentOnboarding/utils';
import { useCanManageProject } from '../../hooks/useHomepageAbilities';
import { useIsNewOnboardingOrg } from '../../hooks/useIsNewOnboardingOrg';
import { type RecommendedActionsState } from '../useRecommendedActions';
import { buildSetupGuide, type SetupGuideRowId } from './setupGuideModel';

export const useSetupGuide = (
    projectUuid: string,
    actions: RecommendedActionsState,
) => {
    const { user } = useApp();
    const userUuid = user.data?.userUuid;
    const newOnboardingOrg = useIsNewOnboardingOrg();
    const liveSourcesFlag = useServerFeatureFlag(FeatureFlags.ApiQuerySources);
    const codingAgentFlag = useServerFeatureFlag(
        FeatureFlags.CodingAgentOnboarding,
    );
    const semanticStudioFlag = useServerFeatureFlag(
        FeatureFlags.SemanticStudio,
    );
    const canManageProject = useCanManageProject(projectUuid);
    // visibleActions is empty on the playground, where setup has no place
    const isEligible =
        newOnboardingOrg.isNewOrg &&
        canManageProject &&
        actions.visibleActions.length > 0;
    const enabled = { enabled: isEligible };
    const agentRunEnabled = {
        enabled: isEligible && codingAgentFlag.data?.enabled === true,
    };

    const explores = useExplores(projectUuid, true, false, enabled);
    const activeRun = useActiveAgentOnboardingRun(projectUuid, agentRunEnabled);
    // The active-run lookup does not poll, so the run itself is watched for completion
    const watchedRun = useAgentOnboardingRun(
        projectUuid,
        activeRun.data?.agentOnboardingRunUuid,
        agentRunEnabled,
    );
    const run = watchedRun.data ?? activeRun.data ?? null;
    const isRunTerminal = !!run && isAgentOnboardingRunTerminal(run.status);
    const latestRun = useLatestAgentOnboardingRun(projectUuid, agentRunEnabled);
    const queryClient = useQueryClient();
    useEffect(() => {
        if (!isRunTerminal) return;
        void queryClient.invalidateQueries({
            queryKey: ['tables', projectUuid],
        });
        void queryClient.invalidateQueries({
            queryKey: ['agent-onboarding-latest-run', projectUuid],
        });
    }, [isRunTerminal, projectUuid, queryClient]);
    // These hooks take no enabled option; an undefined project keeps them idle
    const gatedProjectUuid = isEligible ? projectUuid : undefined;
    const connections = useExternalConnections(gatedProjectUuid);
    const sources = useExternalSources(gatedProjectUuid);
    const brand = useOrganizationBrand(enabled);
    const users = useOrganizationUsers(enabled);
    const charts = useInfiniteContent(
        {
            projectUuids: [projectUuid],
            contentTypes: [ContentType.CHART],
            pageSize: 1,
        },
        enabled,
    );
    const chartTypesEnabled = useChartTypesEnabled();
    const chartTypes = useDataAppVisualizations(
        isEligible && chartTypesEnabled.enabled ? projectUuid : undefined,
    );

    // ponytail: dismissal is per user and project in localStorage, the server skip table only accepts checklist keys
    const [isDismissed, setIsDismissed] = useLocalStorage<boolean>(
        `homepage-setup-guide-dismissed-${userUuid ?? 'anon'}-${projectUuid}`,
    );
    // Below xl the open dock overlaps the centred hero, so it starts as a pill
    const isNarrow = useMatches(
        { base: true, xl: false },
        { getInitialValueInEffect: false },
    );

    // ponytail: same per-browser store for steps the server skip table can't hold
    const [skippedRows, setSkippedRows] = useLocalStorage<SetupGuideRowId[]>(
        `homepage-setup-guide-skipped-${userUuid ?? 'anon'}-${projectUuid}`,
        [],
    );

    // Hold a slot while eligibility resolves so the guide doesn't push the page down
    const isLoading =
        canManageProject &&
        (newOnboardingOrg.isLoading ||
            (newOnboardingOrg.isNewOrg &&
                (actions.isLoading ||
                    [explores, activeRun, brand].some(
                        (query) => query.isInitialLoading,
                    ))));

    const chartCount = charts.data
        ? (charts.data.pages[0]?.pagination?.totalResults ?? 0)
        : null;
    const completedRun =
        latestRun.data?.status === 'completed' ? latestRun.data : null;
    const semanticExplores = (explores.data ?? []).filter(
        isSemanticLayerExplore,
    );
    const liveConnections = (connections.data ?? []).filter(
        ({ kind }) => kind === 'live_source',
    );
    const activeRunOrNull = run && !isRunTerminal ? run : null;
    const semanticStudioUrl =
        semanticStudioFlag.data?.enabled === true
            ? getSemanticStudioUrl(projectUuid, { ref: null })
            : null;
    const sections = buildSetupGuide({
        projectUuid,
        statuses: actions.statuses,
        visibleActions: actions.visibleActions,
        skippedActions: actions.skippedActions,
        skippedRows: skippedRows ?? [],
        semanticModelCount: semanticExplores.length,
        chartCount: chartCount ?? 0,
        chartTypeNames: (chartTypes.data?.pages[0]?.data ?? []).map(
            ({ name }) => name,
        ),
        activeRun: activeRunOrNull,
        completedRun,
        semanticStudioUrl,
        canAddLiveSources:
            liveSourcesFlag.data?.enabled === true &&
            !!user.data?.ability.can(
                'manage',
                subject('ExternalConnection', {
                    organizationUuid: user.data.organizationUuid,
                    projectUuid,
                }),
            ),
        appSourceNames: [
            ...liveConnections.map(({ name }) => name),
            ...(sources.data ?? []).map(({ name }) => name),
        ],
        brand: brand.data ?? null,
        teammateCount: (users.data ?? []).filter(
            (member) => member.userUuid !== userUuid,
        ).length,
    });

    return {
        isEligible,
        isLoading,
        sections,
        semanticExplores,
        liveConnections,
        semanticStudioUrl,
        chartCount,
        activeRun: activeRunOrNull,
        completedRunUrl: completedRun
            ? getAgentOnboardingRunUrl(
                  completedRun.agentOnboardingRunUuid,
                  completedRun.projectUuid,
              )
            : null,
        isDismissed: isDismissed ?? isNarrow,
        setIsDismissed: (next: boolean) => setIsDismissed(next),
        skipRow: (id: SetupGuideRowId) =>
            setSkippedRows([...(skippedRows ?? []), id]),
        restoreRow: (id: SetupGuideRowId) =>
            setSkippedRows((skippedRows ?? []).filter((row) => row !== id)),
        skipAction: actions.skipAction,
        restoreAction: actions.restoreAction,
    };
};

export type SetupGuideState = ReturnType<typeof useSetupGuide>;
