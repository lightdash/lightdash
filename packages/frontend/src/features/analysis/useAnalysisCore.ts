import {
    type AnalysisTargetLocator,
    type ApiError,
    type DataAppAnalysis,
    type DataAppAnalysisSource,
    type DataAppInvestigation,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    detectAnalysisAnomalies,
    investigateAnalysisAnomaly,
    lookupAnalysis,
} from './api';
import { sourcesSignature } from './sourcesSignature';

export type InvestigationState =
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'ready'; investigation: DataAppInvestigation }
    | { status: 'error'; message: string };

export type AnalysisState =
    | { status: 'idle' }
    | { status: 'analysing' }
    | { status: 'ready'; analysis: DataAppAnalysis; stale: boolean }
    | { status: 'error'; message: string };

const errorMessage = (e: unknown): string =>
    (e as ApiError)?.error?.message ??
    (e instanceof Error ? e.message : 'Something went wrong');

const errorCode = (e: unknown): string | undefined =>
    ((e as ApiError)?.error?.data as { code?: string } | undefined)?.code;

// Limits an auto-run should absorb silently: the viewer's minute bucket or
// the org's daily cap. A manual run still shows the message.
const isLimited = (e: unknown): boolean =>
    (e as ApiError)?.error?.statusCode === 429 ||
    errorCode(e) === 'budget_exhausted';

// The stored rows behind a source are gone; the page re-runs its queries once.
const isSourcesExpired = (e: unknown): boolean =>
    errorCode(e) === 'sources_expired';

const EXPIRED_TWICE_MESSAGE =
    'The data behind this view expired. Refresh and analyse again.';

const LOOKUP_QUIET_MS = 400;

type ScopedState = {
    scope: string;
    state: AnalysisState;
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

const targetScope = (projectUuid: string, target: AnalysisTargetLocator) =>
    target.kind === 'app'
        ? `${projectUuid}:app:${target.appUuid}`
        : `${projectUuid}:dashboard:${target.dashboardUuid}`;

/**
 * Drives one "Analyse this view" panel over any analysis target: runs
 * lookup/detect over the sources the page supplies, runs investigations per
 * anomaly, and flags the result stale when the view's sources change.
 * Responses for an older run are dropped so a slow request never overwrites
 * a new view.
 */
export const useAnalysisCore = ({
    projectUuid,
    target,
    sources,
    inFlight,
    enabled,
    autoAnalyse = false,
    instructions = null,
    onSourcesExpired,
}: {
    projectUuid: string;
    target: AnalysisTargetLocator;
    /** The current view's queries, chosen by the page. */
    sources: DataAppAnalysisSource[];
    /** True while the page still has queries running. */
    inFlight: boolean;
    /**
     * Analysis is on for this org and viewer. Off, the hook makes no request
     * at all, so pages in orgs without the feature behave exactly as before.
     */
    enabled: boolean;
    /** Run detect on a quiet view that has no stored analysis. */
    autoAnalyse?: boolean;
    /** Author guidance forwarded to the model. Part of the analysis
     *  identity: a change re-looks-up and never reuses a stored analysis
     *  generated under other instructions. */
    instructions?: string | null;
    /**
     * Re-run the page's queries. Called at most once per analyse when the
     * sources expired; the fresh view is analysed again.
     */
    onSourcesExpired?: () => void;
}) => {
    const lightdashApi = useLightdashApi();
    // Instructions join the view identity so a stored analysis generated
    // under other guidance is never shown for this one.
    const signature = useMemo(
        () => `${sourcesSignature(sources)}|instr:${instructions ?? ''}`,
        [sources, instructions],
    );

    // All analysis state is keyed by project+target and read through the
    // current key, so switching targets never renders the previous target's
    // analysis, not even for the render before the reset effect runs.
    const scope = targetScope(projectUuid, target);
    const [stored, setStored] = useState<ScopedState>(() => freshState(scope));
    const current = stored.scope === scope ? stored : freshState(scope);
    const runRef = useRef(0);
    // The scope whose reload for expired sources is in flight: its next
    // view is analysed without being asked, as a retry that never reloads
    // again. Consumed by whatever that view resolves to, or a target switch.
    const retryAfterReloadRef = useRef<string | null>(null);
    const onSourcesExpiredRef = useRef(onSourcesExpired);
    onSourcesExpiredRef.current = onSourcesExpired;

    useEffect(() => {
        if (stored.scope === scope) return;
        runRef.current += 1;
        retryAfterReloadRef.current = null;
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
            isRetry = false,
        ) => {
            runRef.current += 1;
            const run = runRef.current;
            patch(scope, (prev) => ({
                ...prev,
                state: { status: 'analysing' },
                investigations: {},
            }));
            try {
                const analysis = await detectAnalysisAnomalies(lightdashApi, {
                    projectUuid,
                    target,
                    sources: sourcesToAnalyse,
                    instructions,
                    force,
                });
                if (run !== runRef.current) return;
                patch(scope, (prev) => ({
                    ...prev,
                    analysedSignature: `${sourcesSignature(
                        sourcesToAnalyse,
                    )}|instr:${instructions ?? ''}`,
                    state: { status: 'ready', analysis, stale: false },
                }));
            } catch (e) {
                if (run !== runRef.current) return;
                if (isSourcesExpired(e)) {
                    const reload = onSourcesExpiredRef.current;
                    if (reload && !isRetry) {
                        retryAfterReloadRef.current = scope;
                        patch(scope, (prev) => ({
                            ...prev,
                            state: { status: 'idle' },
                        }));
                        reload();
                        return;
                    }
                    patch(scope, (prev) => ({
                        ...prev,
                        state: {
                            status: 'error',
                            message: EXPIRED_TWICE_MESSAGE,
                        },
                    }));
                    return;
                }
                // Auto-run hit a limit: nothing to show, the next view
                // change tries again.
                if (auto && isLimited(e)) {
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
        [projectUuid, target, scope, patch, lightdashApi, instructions],
    );

    const { state } = current;
    const stale =
        state.status === 'ready' &&
        current.analysedSignature !== null &&
        current.analysedSignature !== signature;

    // A view that was analysed before (by this viewer, or by anyone with the
    // same rows) opens with its findings; a miss runs detect only when the
    // page asks for analysis on load.
    const shouldLookUp =
        enabled &&
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
            lookupAnalysis(lightdashApi, {
                projectUuid,
                target,
                sources,
                instructions,
            })
                .then((found) => {
                    // Drop a response for a view that is no longer current:
                    // a newer analyse run, or a later lookup for other rows.
                    if (
                        run !== runRef.current ||
                        signature !== signatureRef.current
                    ) {
                        return;
                    }
                    const retrying = retryAfterReloadRef.current === scope;
                    retryAfterReloadRef.current = null;
                    if (!found) {
                        if (retrying) {
                            void analyse(sources, false, true, true);
                        } else if (autoAnalyseRef.current) {
                            void analyse(sources, false, true);
                        }
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
                .catch((e: unknown) => {
                    if (
                        run !== runRef.current ||
                        signature !== signatureRef.current
                    ) {
                        return;
                    }
                    // The reloaded view expired as well: the same dead end
                    // detect would reach, reported instead of swallowed.
                    if (
                        retryAfterReloadRef.current === scope &&
                        isSourcesExpired(e)
                    ) {
                        retryAfterReloadRef.current = null;
                        patch(scope, (prev) => ({
                            ...prev,
                            state: {
                                status: 'error',
                                message: EXPIRED_TWICE_MESSAGE,
                            },
                        }));
                    }
                    // Any other failed lookup is not an error state; Analyse works.
                });
        }, LOOKUP_QUIET_MS);
        return () => clearTimeout(timer);
    }, [
        shouldLookUp,
        scope,
        signature,
        sources,
        instructions,
        projectUuid,
        target,
        patch,
        analyse,
        lightdashApi,
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
                const investigation = await investigateAnalysisAnomaly(
                    lightdashApi,
                    {
                        projectUuid,
                        target,
                        analysisId,
                        anomalyId,
                        agentUuid,
                    },
                );
                if (run !== runRef.current) return;
                setInvestigation({ status: 'ready', investigation });
            } catch (e) {
                if (run !== runRef.current) return;
                setInvestigation({ status: 'error', message: errorMessage(e) });
            }
        },
        [projectUuid, target, scope, state, patch, lightdashApi],
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
