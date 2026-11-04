import { subject } from '@casl/ability';
import {
    ContentType,
    FeatureFlags,
    isAgentOnboardingRunTerminal,
    isSemanticLayerExplore,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocalStorage } from 'react-use';
import { useExternalConnections } from '../../../../../features/externalConnections/hooks/useExternalConnections';
import { useExternalSources } from '../../../../../features/externalSources/hooks/useExternalSources';
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
import { type RecommendedActionsState } from '../useRecommendedActions';
import { buildSetupGuide, type SetupGuideRowId } from './setupGuideModel';

export const useSetupGuide = (
    projectUuid: string,
    actions: RecommendedActionsState,
) => {
    const { user } = useApp();
    const userUuid = user.data?.userUuid;
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const liveSourcesFlag = useServerFeatureFlag(FeatureFlags.ApiQuerySources);
    const codingAgentFlag = useServerFeatureFlag(
        FeatureFlags.CodingAgentOnboarding,
    );
    const canManageProject = useCanManageProject(projectUuid);
    // visibleActions is empty on the playground, where setup has no place
    const isEligible =
        newOnboardingFlag.data?.enabled === true &&
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

    // ponytail: dismissal is per user and project in localStorage, the server skip table only accepts checklist keys
    const [isDismissed, setIsDismissed] = useLocalStorage(
        `homepage-setup-guide-dismissed-${userUuid ?? 'anon'}-${projectUuid}`,
        false,
    );

    // ponytail: same per-browser store for steps the server skip table can't hold
    const [skippedRows, setSkippedRows] = useLocalStorage<SetupGuideRowId[]>(
        `homepage-setup-guide-skipped-${userUuid ?? 'anon'}-${projectUuid}`,
        [],
    );

    // Hold a slot while eligibility resolves so the guide doesn't push the page down
    const isLoading =
        newOnboardingFlag.data?.enabled !== false &&
        canManageProject &&
        (newOnboardingFlag.isInitialLoading ||
            actions.isLoading ||
            [explores, activeRun, brand].some(
                (query) => query.isInitialLoading,
            ));

    const completedRun =
        latestRun.data?.status === 'completed' ? latestRun.data : null;
    const semanticExplores = (explores.data ?? []).filter(
        isSemanticLayerExplore,
    );
    const liveConnections = (connections.data ?? []).filter(
        ({ kind }) => kind === 'live_source',
    );
    const activeRunOrNull = run && !isRunTerminal ? run : null;
    const sections = buildSetupGuide({
        projectUuid,
        statuses: actions.statuses,
        visibleActions: actions.visibleActions,
        skippedActions: actions.skippedActions,
        skippedRows: skippedRows ?? [],
        semanticModelCount: semanticExplores.length,
        chartCount: charts.data?.pages[0]?.pagination?.totalResults ?? 0,
        activeRun: activeRunOrNull,
        completedRun,
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
        activeRun: activeRunOrNull,
        completedRunUrl: completedRun
            ? getAgentOnboardingRunUrl(
                  completedRun.agentOnboardingRunUuid,
                  completedRun.projectUuid,
              )
            : null,
        isDismissed: isDismissed === true,
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
