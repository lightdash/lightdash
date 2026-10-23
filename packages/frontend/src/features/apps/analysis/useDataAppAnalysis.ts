import { useMemo } from 'react';
import {
    useAnalysisCore,
    type AnalysisState,
    type InvestigationState,
} from '../../analysis/useAnalysisCore';
import { type QueryEvent } from '../hooks/useAppSdkBridge';
import {
    hasInFlightQueries,
    selectCurrentViewSources,
    selectMountedViewSources,
} from './currentViewSources';

export type { InvestigationState };
export type DataAppAnalysisState = AnalysisState;

/**
 * App wrapper over the generic analysis core: picks the current view's
 * sources from the tracked query log of the app's SDK bridge (exact mounted
 * queries when the SDK reports them) and analyses them as the app target.
 */
export const useDataAppAnalysis = ({
    projectUuid,
    appUuid,
    queries,
    mountedQueryUuids,
    enabled,
    autoAnalyse = false,
    instructions = null,
    onSourcesExpired,
}: {
    projectUuid: string;
    appUuid: string;
    queries: QueryEvent[];
    /**
     * Analysis is on for this org and viewer. Off, the hook makes no request
     * at all, so apps in orgs without the feature behave exactly as before.
     */
    enabled: boolean;
    /** Exact on-screen queries from an SDK that reports them; null otherwise. */
    mountedQueryUuids: string[] | null;
    /** Run detect on a quiet view that has no stored analysis. */
    autoAnalyse?: boolean;
    /** App-author guidance forwarded to the model. */
    instructions?: string | null;
    /** Re-run the app's queries (reload the iframe); see `useAnalysisCore`. */
    onSourcesExpired?: () => void;
}) => {
    const sources = useMemo(
        () =>
            mountedQueryUuids === null
                ? selectCurrentViewSources(queries)
                : selectMountedViewSources(queries, mountedQueryUuids),
        [queries, mountedQueryUuids],
    );
    const inFlight = useMemo(() => hasInFlightQueries(queries), [queries]);
    const target = useMemo(
        () => ({ kind: 'app' as const, appUuid }),
        [appUuid],
    );
    return useAnalysisCore({
        projectUuid,
        target,
        sources,
        inFlight,
        enabled,
        autoAnalyse,
        instructions,
        onSourcesExpired,
    });
};
