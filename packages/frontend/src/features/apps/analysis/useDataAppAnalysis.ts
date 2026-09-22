import {
    type ApiError,
    type DataAppAnalysis,
    type DataAppAnalysisSource,
    type DataAppInvestigation,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type QueryEvent } from '../hooks/useAppSdkBridge';
import {
    detectDataAppAnomalies,
    investigateDataAppAnomaly,
    lookupDataAppAnalysis,
} from './api';
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

const isRateLimited = (e: unknown): boolean =>
    (e as ApiError)?.error?.statusCode === 429;

const LOOKUP_QUIET_MS = 400;

type ScopedState = {
    scope: string;
    state: DataAppAnalysisState;
    analysedSignature: string | null;
    /** Last view signature a stored analysis was looked up for. */
    lookedUpSignature: string | null;
    investigations: Record<string, InvestigationState>;
};

const freshState = (scope: string): ScopedState => ({
    scope,
    state: { status: 'idle' },
    analysedSignature: null,
    lookedUpSignature: null,
    investigations: {},
});

// Newest investigation per anomaly wins; records arrive oldest first.
const investigationsByAnomaly = (
    records: DataAppInvestigation[],
): Record<string, InvestigationState> =>
    Object.fromEntries(
        records.map((investigation) => [
            investigation.anomaly.id,
            { status: 'ready', investigation },
        ]),
    );

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
    autoAnalyse = false,
}: {
    projectUuid: string;
    appUuid: string;
    queries: QueryEvent[];
    /** Exact on-screen queries from an SDK that reports them; null otherwise. */
    mountedQueryUuids: string[] | null;
    /** Run detect on a quiet view that has no stored analysis. */
    autoAnalyse?: boolean;
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
        async (
            sourcesToAnalyse: DataAppAnalysisSource[],
            force: boolean,
            auto = false,
        ) => {
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
                    force,
                });
                if (run !== runRef.current) return;
                patch(scope, (prev) => ({
                    ...prev,
                    analysedSignature: sourcesSignature(sourcesToAnalyse),
                    state: { status: 'ready', analysis, stale: false },
                }));
            } catch (e) {
                if (run !== runRef.current) return;
                // Auto-run hit the per-viewer rate limit: nothing to show,
                // the next view change tries again.
                if (auto && isRateLimited(e)) {
                    patch(scope, (prev) => ({
                        ...prev,
                        state: { status: 'idle' },
                    }));
                    return;
                }
                patch(scope, (prev) => ({
                    ...prev,
                    state: { status: 'error', message: errorMessage(e) },
                }));
            }
        },
        [projectUuid, appUuid, scope, patch],
    );

    const { state } = current;
    const stale =
        state.status === 'ready' &&
        current.analysedSignature !== null &&
        current.analysedSignature !== signature;

    // A view that was analysed before (by this viewer, or by anyone with the
    // same rows) opens with its findings; a miss runs detect only when the
    // app asks for analysis on load.
    const shouldLookUp =
        sources.length > 0 &&
        !inFlight &&
        current.lookedUpSignature !== signature &&
        (state.status === 'idle' || (state.status === 'ready' && stale));
    // Queries settle one by one on open; wait for a quiet view so a single
    // lookup covers the final set.
    const signatureRef = useRef(signature);
    signatureRef.current = signature;
    const autoAnalyseRef = useRef(autoAnalyse);
    autoAnalyseRef.current = autoAnalyse;
    useEffect(() => {
        if (!shouldLookUp) return undefined;
        const run = runRef.current;
        const timer = setTimeout(() => {
            patch(scope, (prev) => ({ ...prev, lookedUpSignature: signature }));
            lookupDataAppAnalysis({ projectUuid, appUuid, sources })
                .then((found) => {
                    // Drop a response for a view that is no longer current:
                    // a newer analyse run, or a later lookup for other rows.
                    if (
                        run !== runRef.current ||
                        signature !== signatureRef.current
                    ) {
                        return;
                    }
                    if (!found) {
                        if (autoAnalyseRef.current)
                            void analyse(sources, false, true);
                        return;
                    }
                    patch(scope, (prev) => ({
                        ...prev,
                        analysedSignature: signature,
                        state: {
                            status: 'ready',
                            analysis: found.analysis,
                            stale: false,
                        },
                        investigations: investigationsByAnomaly(
                            found.investigations,
                        ),
                    }));
                })
                .catch(() => {
                    // A failed lookup is not an error state; Analyse works.
                });
        }, LOOKUP_QUIET_MS);
        return () => clearTimeout(timer);
    }, [
        shouldLookUp,
        scope,
        signature,
        sources,
        projectUuid,
        appUuid,
        patch,
        analyse,
    ]);

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

    return {
        sources,
        inFlight,
        state: state.status === 'ready' ? { ...state, stale } : state,
        investigations: current.investigations,
        // Re-running a view that already shows a current analysis is a
        // deliberate regenerate; anything else may still reuse a stored one.
        analyse: () => analyse(sources, state.status === 'ready' && !stale),
        investigate,
    };
};
