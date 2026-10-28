import {
    type DataAppInsightAction,
    type DataAppInsightsPayload,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import {
    useAnalysisController,
    type AnalysisController,
} from '../../analysis/useAnalysisController';
import { type InvestigationState } from '../../analysis/useAnalysisCore';
import { type QueryEvent } from '../hooks/useAppSdkBridge';
import {
    hasInFlightQueries,
    selectCurrentViewSources,
    selectMountedViewSources,
} from './currentViewSources';
import { type DataAppAnalysisAvailability } from './useDataAppAnalysisAvailability';

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
 * the generic controller drives the panel, and the same state is pushed into
 * the iframe so an app on a current SDK can render it inline and fire
 * actions back.
 */
export const useDataAppAnalysisController = ({
    projectUuid,
    appUuid,
    queries,
    availability,
    instructions = null,
    onNeedsAgent,
    onSourcesExpired,
    openThread,
}: {
    projectUuid: string | undefined;
    appUuid: string | undefined;
    queries: QueryEvent[];
    availability: DataAppAnalysisAvailability;
    /** App-author guidance for the model, declared in app code. */
    instructions?: string | null;
    /** Called when the app asks to investigate but no agent is picked yet. */
    onNeedsAgent: () => void;
    /** Reload the app so its queries re-run; see `useAnalysisCore`. */
    onSourcesExpired?: () => void;
    /** Where "Continue in Ask AI" goes; defaults to the launcher panel. */
    openThread?: (thread: { threadUuid: string; agentUuid: string }) => void;
}) => {
    const [mountedQueryUuids, setMountedQueryUuids] = useState<string[] | null>(
        null,
    );
    const sources = useMemo(
        () =>
            mountedQueryUuids === null
                ? selectCurrentViewSources(queries)
                : selectMountedViewSources(queries, mountedQueryUuids),
        [queries, mountedQueryUuids],
    );
    const inFlight = useMemo(() => hasInFlightQueries(queries), [queries]);
    // Route params resolve before anything renders; without an app the
    // controller stays disabled and never sends a request.
    const target = useMemo(
        () => (appUuid ? { kind: 'app' as const, appUuid } : null),
        [appUuid],
    );
    const controller: AnalysisController = useAnalysisController({
        projectUuid,
        target,
        sources,
        inFlight,
        availability,
        instructions,
        onNeedsAgent,
        onSourcesExpired,
        openThread,
    });

    const {
        state,
        investigations,
        analyse,
        investigateAnomaly,
        continueInAskAi,
        selectedAgentUuid,
    } = controller;

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
        ...controller,
        handleAction,
        insightsPayload,
        setMountedQueryUuids,
        mountedQueriesReported: mountedQueryUuids !== null,
    };
};

export type DataAppAnalysisController = ReturnType<
    typeof useDataAppAnalysisController
>;
