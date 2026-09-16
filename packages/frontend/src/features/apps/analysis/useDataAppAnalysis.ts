import {
    type ApiError,
    type DataAppAnalysis,
    type DataAppAnalysisSource,
    type DataAppInvestigation,
} from '@lightdash/common';
import { useCallback, useMemo, useRef, useState } from 'react';
import { type QueryEvent } from '../hooks/useAppSdkBridge';
import { detectDataAppAnomalies, investigateDataAppAnomaly } from './api';
import {
    hasInFlightQueries,
    selectCurrentViewSources,
    selectMountedViewSources,
    sourcesSignature,
} from './currentViewSources';

export type InvestigationState =
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'ready'; investigation: DataAppInvestigation }
    | { status: 'error'; message: string };

export type DataAppAnalysisState =
    | { status: 'idle' }
    | { status: 'analysing' }
    | { status: 'ready'; analysis: DataAppAnalysis; stale: boolean }
    | { status: 'error'; message: string };

const errorMessage = (e: unknown): string =>
    (e as ApiError)?.error?.message ??
    (e instanceof Error ? e.message : 'Something went wrong');

/**
 * Drives one "Analyse this view" panel: picks the current view's sources
 * from the tracked query log, runs detect, runs investigations per anomaly,
 * and flags the result stale when the view's sources change. Responses for
 * an older run are dropped so a slow request never overwrites a new view.
 */
export const useDataAppAnalysis = ({
    projectUuid,
    appUuid,
    queries,
    mountedQueryUuids,
}: {
    projectUuid: string;
    appUuid: string;
    queries: QueryEvent[];
    /** Exact on-screen queries from an SDK that reports them; null otherwise. */
    mountedQueryUuids: string[] | null;
}) => {
    const sources = useMemo(
        () =>
            mountedQueryUuids === null
                ? selectCurrentViewSources(queries)
                : selectMountedViewSources(queries, mountedQueryUuids),
        [queries, mountedQueryUuids],
    );
    const signature = useMemo(() => sourcesSignature(sources), [sources]);
    const inFlight = useMemo(() => hasInFlightQueries(queries), [queries]);

    const [state, setState] = useState<DataAppAnalysisState>({
        status: 'idle',
    });
    const [analysedSignature, setAnalysedSignature] = useState<string | null>(
        null,
    );
    const [investigations, setInvestigations] = useState<
        Record<string, InvestigationState>
    >({});
    const runRef = useRef(0);

    const analyse = useCallback(
        async (sourcesToAnalyse: DataAppAnalysisSource[]) => {
            runRef.current += 1;
            const run = runRef.current;
            setState({ status: 'analysing' });
            setInvestigations({});
            try {
                const analysis = await detectDataAppAnomalies({
                    projectUuid,
                    appUuid,
                    sources: sourcesToAnalyse,
                });
                if (run !== runRef.current) return;
                setAnalysedSignature(sourcesSignature(sourcesToAnalyse));
                setState({ status: 'ready', analysis, stale: false });
            } catch (e) {
                if (run !== runRef.current) return;
                setState({ status: 'error', message: errorMessage(e) });
            }
        },
        [projectUuid, appUuid],
    );

    const investigate = useCallback(
        async (anomalyId: string, agentUuid: string) => {
            if (state.status !== 'ready') return;
            const { analysisId } = state.analysis;
            const run = runRef.current;
            setInvestigations((prev) => ({
                ...prev,
                [anomalyId]: { status: 'running' },
            }));
            try {
                const investigation = await investigateDataAppAnomaly({
                    projectUuid,
                    appUuid,
                    analysisId,
                    anomalyId,
                    agentUuid,
                });
                if (run !== runRef.current) return;
                setInvestigations((prev) => ({
                    ...prev,
                    [anomalyId]: { status: 'ready', investigation },
                }));
            } catch (e) {
                if (run !== runRef.current) return;
                setInvestigations((prev) => ({
                    ...prev,
                    [anomalyId]: { status: 'error', message: errorMessage(e) },
                }));
            }
        },
        [projectUuid, appUuid, state],
    );

    const stale =
        state.status === 'ready' &&
        analysedSignature !== null &&
        analysedSignature !== signature;

    return {
        sources,
        inFlight,
        state: state.status === 'ready' ? { ...state, stale } : state,
        investigations,
        analyse: () => analyse(sources),
        investigate,
    };
};
