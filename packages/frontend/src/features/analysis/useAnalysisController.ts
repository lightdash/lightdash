import {
    type AiAgentSummary,
    type AnalysisTargetLocator,
    type DataAppAnalysisSource,
} from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useContext, useMemo } from 'react';
import { LauncherDockContext } from '../../ee/features/aiCopilot/components/Launcher/LauncherDockContext';
import { useProjectAiAgents } from '../../ee/features/aiCopilot/hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../ee/features/aiCopilot/hooks/useUserAgentPreferences';
import { store as aiAgentStore } from '../../ee/features/aiCopilot/store';
import { openPanel } from '../../ee/features/aiCopilot/store/aiAgentLauncherSlice';
import { type DataAppAnalysisAvailability } from '../apps/analysis/useDataAppAnalysisAvailability';
import { useAnalysisCore } from './useAnalysisCore';

// Key kept from the app-only days; values are now keyed by target uuid
// (app or dashboard), which cannot collide.
const AGENT_STORAGE_KEY = 'data-apps:analysis-agent';

const targetUuidOf = (target: AnalysisTargetLocator | null): string | null => {
    if (target === null) return null;
    return target.kind === 'app' ? target.appUuid : target.dashboardUuid;
};

/**
 * One analysis per page, target-agnostic: lookup/detect/investigate state
 * from the core, plus the agent selection, remembered per target, that
 * investigations and Continue in Ask AI need. Pages wrap it with their own
 * source selection and extras (the app page adds its iframe bridge).
 */
export const useAnalysisController = ({
    projectUuid,
    target,
    sources,
    inFlight,
    availability,
    instructions = null,
    onNeedsAgent,
    onSourcesExpired,
    openThread,
}: {
    projectUuid: string | undefined;
    /** Null while route params resolve; no request is made without one. */
    target: AnalysisTargetLocator | null;
    sources: DataAppAnalysisSource[];
    inFlight: boolean;
    availability: DataAppAnalysisAvailability;
    /** Author guidance for the model. */
    instructions?: string | null;
    /** Called when an investigation is asked for but no agent is picked yet. */
    onNeedsAgent: () => void;
    /** Re-run the page's queries; see `useAnalysisCore`. */
    onSourcesExpired?: () => void;
    /** Where "Continue in Ask AI" goes; defaults to the launcher panel. */
    openThread?: (thread: { threadUuid: string; agentUuid: string }) => void;
}) => {
    // The page hosting this may render without the launcher providers (tests,
    // headless renders), so reach the store directly and treat the dock as
    // optional rather than requiring a Provider above.
    const launcherDock = useContext(LauncherDockContext);
    const analysis = useAnalysisCore({
        projectUuid: projectUuid ?? '',
        target: target ?? { kind: 'app', appUuid: '' },
        sources,
        inFlight,
        enabled: availability.status === 'available' && target !== null,
        instructions,
        onSourcesExpired,
    });

    const agentsQuery = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
        options: { enabled: availability.status === 'available' },
    });
    const agents: AiAgentSummary[] = useMemo(
        () => agentsQuery.data ?? [],
        [agentsQuery.data],
    );
    const [agentByTarget, setAgentByTarget] = useLocalStorage<
        Record<string, string>
    >({ key: AGENT_STORAGE_KEY, defaultValue: {} });
    // Investigations need a concrete agent, so the launcher's "auto" router
    // can't apply here; the user's default-agent preference is its anchor.
    const preferencesQuery = useGetUserAgentPreferences(projectUuid, {
        enabled: availability.status === 'available',
    });
    const preferredAgentUuid = preferencesQuery.data?.defaultAgentUuid;
    const targetUuid = targetUuidOf(target);
    const rememberedAgent = targetUuid ? agentByTarget[targetUuid] : undefined;
    // An agent that disappeared or lost access shows as unavailable rather
    // than silently falling back to another one.
    const rememberedIsUsable = agents.some((a) => a.uuid === rememberedAgent);
    const selectedAgentUuid = rememberedAgent
        ? rememberedIsUsable
            ? rememberedAgent
            : null
        : (agents.find((a) => a.uuid === preferredAgentUuid)?.uuid ??
          agents[0]?.uuid ??
          null);
    const rememberedAgentMissing =
        !!rememberedAgent &&
        !rememberedIsUsable &&
        !agentsQuery.isInitialLoading;
    // No agent the viewer can use (none pinned, or no Ask AI access): detect
    // still runs, investigations are hidden with an explanation.
    const agentAccess: 'loading' | 'none' | 'available' =
        agentsQuery.isInitialLoading
            ? 'loading'
            : agents.length === 0
              ? 'none'
              : 'available';
    const selectAgent = useCallback(
        (agentUuid: string) => {
            if (!targetUuid) return;
            setAgentByTarget({ ...agentByTarget, [targetUuid]: agentUuid });
        },
        [agentByTarget, targetUuid, setAgentByTarget],
    );

    const { investigations, investigate } = analysis;

    const investigateAnomaly = useCallback(
        (anomalyId: string) => {
            if (!selectedAgentUuid) {
                onNeedsAgent();
                return;
            }
            void investigate(anomalyId, selectedAgentUuid);
        },
        [investigate, onNeedsAgent, selectedAgentUuid],
    );

    // The launcher only shows threads it knows about, so dock it first.
    const canContinueInAskAi =
        availability.status === 'available' && availability.canContinueInAskAi;
    const continueInAskAi = useCallback(
        (anomalyId: string) => {
            if (!canContinueInAskAi) return;
            const investigation = investigations[anomalyId];
            if (investigation?.status !== 'ready') return;
            const { threadUuid, agentUuid, anomaly } =
                investigation.investigation;
            if (openThread) {
                openThread({ threadUuid, agentUuid });
                return;
            }
            if (projectUuid) {
                launcherDock?.addItem(projectUuid, {
                    threadId: threadUuid,
                    agentUuid,
                    title: anomaly.text,
                    createdAt: Date.now(),
                });
            }
            aiAgentStore.dispatch(
                openPanel({ threadId: threadUuid, agentUuid }),
            );
        },
        [
            canContinueInAskAi,
            investigations,
            launcherDock,
            openThread,
            projectUuid,
        ],
    );

    return {
        ...analysis,
        agents,
        agentsLoading: agentsQuery.isInitialLoading,
        agentAccess,
        selectedAgentUuid,
        rememberedAgentMissing,
        selectAgent,
        investigateAnomaly,
        continueInAskAi,
        canContinueInAskAi,
    };
};

/** What the launcher's analysis panel needs; every target's wrapper returns at least this. */
export type AnalysisController = ReturnType<typeof useAnalysisController>;
