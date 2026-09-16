import {
    type ApiError,
    type DataAppAnalysis,
    type DataAppAnalysisSource,
    type DataAppInvestigation,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type ScopedState = {
    scope: string;
    state: DataAppAnalysisState;
    analysedSignature: string | null;
    investigations: Record<string, InvestigationState>;
};

const freshState = (scope: string): ScopedState => ({
    scope,
    state: { status: 'idle' },
    analysedSignature: null,
    investigations: {},
});

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

    // All analysis state is keyed by project+app and read through the current
    // key, so switching apps never renders the previous app's analysis, not
    // even for the render before the reset effect runs.
    const scope = `${projectUuid}:${appUuid}`;
    const [stored, setStored] = useState<ScopedState>(() => freshState(scope));
    const current = stored.scope === scope ? stored : freshState(scope);
    const runRef = useRef(0);

    useEffect(() => {
        if (stored.scope === scope) return;
        runRef.current += 1;
        setStored(freshState(scope));
    }, [scope, stored.scope]);

    const patch = useCallback(
        (requestScope: string, update: (prev: ScopedState) => ScopedState) =>
            setStored((prev) =>
                prev.scope === requestScope ? update(prev) : prev,
            ),
        [],
    );

    const analyse = useCallback(
        async (sourcesToAnalyse: DataAppAnalysisSource[]) => {
            runRef.current += 1;
            const run = runRef.current;
            patch(scope, (prev) => ({
                ...prev,
                state: { status: 'analysing' },
                investigations: {},
            }));
            try {
                const analysis = await detectDataAppAnomalies({
                    projectUuid,
                    appUuid,
                    sources: sourcesToAnalyse,
                });
                if (run !== runRef.current) return;
                patch(scope, (prev) => ({
                    ...prev,
                    analysedSignature: sourcesSignature(sourcesToAnalyse),
                    state: { status: 'ready', analysis, stale: false },
                }));
            } catch (e) {
                if (run !== runRef.current) return;
                patch(scope, (prev) => ({
                    ...prev,
                    state: { status: 'error', message: errorMessage(e) },
                }));
            }
        },
        [projectUuid, appUuid, scope, patch],
    );

    const { state } = current;
    const investigate = useCallback(
        async (anomalyId: string, agentUuid: string) => {
            if (state.status !== 'ready') return;
            const { analysisId } = state.analysis;
            const run = runRef.current;
            const setInvestigation = (value: InvestigationState) =>
                patch(scope, (prev) => ({
                    ...prev,
                    investigations: {
                        ...prev.investigations,
                        [anomalyId]: value,
                    },
                }));
            setInvestigation({ status: 'running' });
            try {
                const investigation = await investigateDataAppAnomaly({
                    projectUuid,
                    appUuid,
                    analysisId,
                    anomalyId,
                    agentUuid,
                });
                if (run !== runRef.current) return;
                setInvestigation({ status: 'ready', investigation });
            } catch (e) {
                if (run !== runRef.current) return;
                setInvestigation({ status: 'error', message: errorMessage(e) });
            }
        },
        [projectUuid, appUuid, scope, state, patch],
    );

    const stale =
        state.status === 'ready' &&
        current.analysedSignature !== null &&
        current.analysedSignature !== signature;

    return {
        sources,
        inFlight,
        state: state.status === 'ready' ? { ...state, stale } : state,
        investigations: current.investigations,
        analyse: () => analyse(sources),
        investigate,
    };
};
