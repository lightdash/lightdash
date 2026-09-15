import {
    type AiAgentSummary,
    type DataAppInsightAction,
    type DataAppInsightsPayload,
} from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useMemo, useState } from 'react';
import { useLauncherDock } from '../../../ee/features/aiCopilot/components/Launcher/useLauncherDock';
import { useProjectAiAgents } from '../../../ee/features/aiCopilot/hooks/useProjectAiAgents';
import { openPanel } from '../../../ee/features/aiCopilot/store/aiAgentLauncherSlice';
import { useAiAgentStoreDispatch } from '../../../ee/features/aiCopilot/store/hooks';
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
    onNeedsAgent,
}: {
    projectUuid: string | undefined;
    appUuid: string | undefined;
    queries: QueryEvent[];
    availability: DataAppAnalysisAvailability;
    /** Called when the app asks to investigate but no agent is picked yet. */
    onNeedsAgent: () => void;
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const { addItem: addDockItem } = useLauncherDock(projectUuid);
    const [mountedQueryUuids, setMountedQueryUuids] = useState<string[] | null>(
        null,
    );
    // Route params resolve before anything renders; empty ids are never sent.
    const analysis = useDataAppAnalysis({
        projectUuid: projectUuid ?? '',
        appUuid: appUuid ?? '',
        queries,
        mountedQueryUuids,
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
    const continueInAskAi = useCallback(
        (anomalyId: string) => {
            const investigation = investigations[anomalyId];
            if (investigation?.status !== 'ready') return;
            const { threadUuid, agentUuid, anomaly } =
                investigation.investigation;
            addDockItem({
                threadId: threadUuid,
                agentUuid,
                title: anomaly.text,
                createdAt: Date.now(),
            });
            dispatch(openPanel({ threadId: threadUuid, agentUuid }));
        },
        [addDockItem, dispatch, investigations],
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
            error: null,
            anomalies: [],
        };
        if (availability.status === 'unavailable') {
            return { ...base, status: 'unavailable', canInvestigate: false };
        }
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
    }, [availability.status, investigations, selectedAgentUuid, state]);

    return {
        ...analysis,
        agents,
        agentsLoading: agentsQuery.isInitialLoading,
        selectedAgentUuid,
        rememberedAgentMissing,
        selectAgent,
        investigateAnomaly,
        continueInAskAi,
        handleAction,
        insightsPayload,
        setMountedQueryUuids,
        mountedQueriesReported: mountedQueryUuids !== null,
    };
};

export type DataAppAnalysisController = ReturnType<
    typeof useDataAppAnalysisController
>;
