import {
    type AiAgentSummary,
    type DataAppAutoAnalysis,
    type DataAppInsightAction,
    type DataAppInsightsPayload,
} from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useContext, useMemo, useState } from 'react';
import { LauncherDockContext } from '../../../ee/features/aiCopilot/components/Launcher/LauncherDockContext';
import { useProjectAiAgents } from '../../../ee/features/aiCopilot/hooks/useProjectAiAgents';
import { store as aiAgentStore } from '../../../ee/features/aiCopilot/store';
import { openPanel } from '../../../ee/features/aiCopilot/store/aiAgentLauncherSlice';
import { type QueryEvent } from '../hooks/useAppSdkBridge';
import {
    useDataAppAnalysis,
    type InvestigationState,
} from './useDataAppAnalysis';
import { type DataAppAnalysisAvailability } from './useDataAppAnalysisAvailability';

const AGENT_STORAGE_KEY = 'data-apps:analysis-agent';

const toInvestigation = (
    state: InvestigationState | undefined,
): DataAppInsightsPayload['anomalies'][number]['investigation'] => {
    switch (state?.status) {
        case 'running':
            return {
                status: 'running',
                explanation: null,
                partial: false,
                threadUuid: null,
                error: null,
            };
        case 'ready':
            return {
                status: 'ready',
                explanation: state.investigation.explanation,
                partial: state.investigation.partial,
                threadUuid: state.investigation.threadUuid,
                error: null,
            };
        case 'error':
            return {
                status: 'error',
                explanation: null,
                partial: false,
                threadUuid: null,
                error: state.message,
            };
        default:
            return {
                status: 'idle',
                explanation: null,
                partial: false,
                threadUuid: null,
                error: null,
            };
    }
};

/**
 * One analysis per app page, shared by the host panel and the app itself:
 * the panel renders it, and the same state is pushed into the iframe so an
 * app on a current SDK can render it inline and fire actions back.
 */
export const useDataAppAnalysisController = ({
    projectUuid,
    appUuid,
    queries,
    availability,
    autoAnalyse = 'inherit',
    onNeedsAgent,
    onSourcesExpired,
    openThread,
}: {
    projectUuid: string | undefined;
    appUuid: string | undefined;
    queries: QueryEvent[];
    availability: DataAppAnalysisAvailability;
    /** The app's own choice; 'inherit' takes the org default. */
    autoAnalyse?: DataAppAutoAnalysis;
    /** Called when the app asks to investigate but no agent is picked yet. */
    onNeedsAgent: () => void;
    /** Reload the app so its queries re-run; see `useDataAppAnalysis`. */
    onSourcesExpired?: () => void;
    /** Where "Continue in Ask AI" goes; defaults to the launcher panel. */
    openThread?: (thread: { threadUuid: string; agentUuid: string }) => void;
}) => {
    // The page hosting this may render without the launcher providers (tests,
    // headless renders), so reach the store directly and treat the dock as
    // optional rather than requiring a Provider above.
    const launcherDock = useContext(LauncherDockContext);
    const [mountedQueryUuids, setMountedQueryUuids] = useState<string[] | null>(
        null,
    );
    const autoAnalyseResolved =
        availability.status === 'available' &&
        (autoAnalyse === 'inherit'
            ? availability.autoAnalyseDefault
            : autoAnalyse === 'on');
    // Route params resolve before anything renders; empty ids are never sent.
    const analysis = useDataAppAnalysis({
        projectUuid: projectUuid ?? '',
        appUuid: appUuid ?? '',
        queries,
        mountedQueryUuids,
        enabled: availability.status === 'available',
        autoAnalyse: autoAnalyseResolved,
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
    const [agentByApp, setAgentByApp] = useLocalStorage<Record<string, string>>(
        { key: AGENT_STORAGE_KEY, defaultValue: {} },
    );
    const rememberedAgent = appUuid ? agentByApp[appUuid] : undefined;
    // An agent that disappeared or lost access shows as unavailable rather
    // than silently falling back to another one.
    const rememberedIsUsable = agents.some((a) => a.uuid === rememberedAgent);
    const selectedAgentUuid = rememberedAgent
        ? rememberedIsUsable
            ? rememberedAgent
            : null
        : (agents[0]?.uuid ?? null);
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
            if (!appUuid) return;
            setAgentByApp({ ...agentByApp, [appUuid]: agentUuid });
        },
        [agentByApp, appUuid, setAgentByApp],
    );

    const { state, investigations, analyse, investigate } = analysis;

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

    const handleAction = useCallback(
        (action: DataAppInsightAction) => {
            switch (action.action) {
                case 'analyse':
                    void analyse();
                    return;
                case 'investigate':
                    investigateAnomaly(action.anomalyId);
                    return;
                case 'continue':
                    continueInAskAi(action.anomalyId);
                    return;
                default:
                    return;
            }
        },
        [analyse, continueInAskAi, investigateAnomaly],
    );

    // What the app sees. Null until the org is rolled out so old and new
    // apps alike stay idle when the feature is off.
    const insightsPayload = useMemo<DataAppInsightsPayload | null>(() => {
        if (availability.status === 'loading') return null;
        const base = {
            analysisId: null,
            headline: null,
            summary: null,
            limitations: [],
            dataAsOf: null,
            generatedAt: null,
            stale: false,
            canInvestigate: selectedAgentUuid !== null,
            canContinue: false,
            error: null,
            anomalies: [],
        };
        if (availability.status === 'unavailable') {
            return { ...base, status: 'unavailable', canInvestigate: false };
        }
        const canContinue = availability.canContinueInAskAi;
        switch (state.status) {
            case 'idle':
                return { ...base, status: 'idle' };
            case 'analysing':
                return { ...base, status: 'analysing' };
            case 'error':
                return { ...base, status: 'error', error: state.message };
            case 'ready':
                return {
                    ...base,
                    status: 'ready',
                    analysisId: state.analysis.analysisId,
                    headline: state.analysis.headline,
                    summary: state.analysis.summary,
                    limitations: state.analysis.limitations,
                    dataAsOf: state.analysis.dataAsOf,
                    generatedAt: new Date(
                        state.analysis.generatedAt,
                    ).toISOString(),
                    stale: state.stale,
                    canInvestigate: selectedAgentUuid !== null && !state.stale,
                    canContinue,
                    anomalies: state.analysis.anomalies.map((anomaly) => ({
                        ...anomaly,
                        investigation: toInvestigation(
                            investigations[anomaly.id],
                        ),
                    })),
                };
            default:
                return null;
        }
    }, [availability, investigations, selectedAgentUuid, state]);

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
        handleAction,
        insightsPayload,
        setMountedQueryUuids,
        mountedQueriesReported: mountedQueryUuids !== null,
    };
};

export type DataAppAnalysisController = ReturnType<
    typeof useDataAppAnalysisController
>;
