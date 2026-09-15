/**
 * AI analysis inside the app — the iframe-side half of "Analyse this view".
 * The host runs detection and investigations over the queries the app ran
 * and pushes the results in; the app only renders them (an executive
 * summary, markers on the flagged points, an Investigate action). The SDK
 * never calls the analysis endpoints itself.
 *
 * Protocol (parent <-> iframe), all over postMessage:
 *   iframe -> parent : lightdash:sdk:insights-request         (once the listener is live, and on sdk:ready)
 *   parent -> iframe : lightdash:sdk:insights {payload}       (in reply, and on every change)
 *   iframe -> parent : lightdash:sdk:insight-action {action}  (analyse / investigate / continue)
 *   iframe -> parent : lightdash:sdk:mounted-queries {uuids}  (which queries are on screen right now)
 *
 * Mirrored by the host in packages/common/src/ee/apps/types.ts.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Row } from './types';

export type InsightSeverity = 'high' | 'medium' | 'positive' | 'info';

export type InsightInvestigation = {
    status: 'idle' | 'running' | 'ready' | 'error';
    /** Markdown, once ready. */
    explanation: string | null;
    /** True when the query budget ran out before the agent finished. */
    partial: boolean;
    threadUuid: string | null;
    error: string | null;
};

/** One notable data point. `dimensionValues` identify the row it refers to. */
export type Insight = {
    id: string;
    severity: InsightSeverity;
    text: string;
    queryUuid: string;
    fieldId: string;
    /** Dimension field id → value as shown in the results. */
    dimensionValues: Record<string, string>;
    expected: string | null;
    actual: string | null;
    investigation: InsightInvestigation;
};

export type InsightsStatus =
    | 'idle'
    | 'analysing'
    | 'ready'
    | 'error'
    | 'unavailable';

/** What the host pushes: the whole analysis for the current view. */
export type InsightsPayload = {
    status: InsightsStatus;
    analysisId: string | null;
    headline: string | null;
    summary: string | null;
    limitations: string[];
    dataAsOf: string | null;
    /** ISO timestamp. */
    generatedAt: string | null;
    /** The view changed since this analysis; a re-run is offered. */
    stale: boolean;
    /** False when no agent is available for investigations. */
    canInvestigate: boolean;
    error: string | null;
    anomalies: Insight[];
};

export type InsightsMessage = {
    type: 'lightdash:sdk:insights';
    payload: InsightsPayload;
};

export type InsightsRequestMessage = { type: 'lightdash:sdk:insights-request' };

export type InsightAction =
    | { action: 'analyse' }
    | { action: 'investigate'; anomalyId: string }
    | { action: 'continue'; anomalyId: string };

export type InsightActionMessage = {
    type: 'lightdash:sdk:insight-action';
} & InsightAction;

export type MountedQueriesMessage = {
    type: 'lightdash:sdk:mounted-queries';
    queryUuids: string[];
};

export const INSIGHTS_MESSAGE = 'lightdash:sdk:insights';
export const INSIGHTS_REQUEST_MESSAGE = 'lightdash:sdk:insights-request';
export const INSIGHT_ACTION_MESSAGE = 'lightdash:sdk:insight-action';
export const MOUNTED_QUERIES_MESSAGE = 'lightdash:sdk:mounted-queries';

const SDK_READY_MESSAGE = 'lightdash:sdk:ready';

export const EMPTY_INSIGHTS: InsightsPayload = {
    status: 'idle',
    analysisId: null,
    headline: null,
    summary: null,
    limitations: [],
    dataAsOf: null,
    generatedAt: null,
    stale: false,
    canInvestigate: false,
    error: null,
    anomalies: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
    isRecord(value) && Object.values(value).every((v) => typeof v === 'string');

const STATUSES: InsightsStatus[] = [
    'idle',
    'analysing',
    'ready',
    'error',
    'unavailable',
];
const SEVERITIES: InsightSeverity[] = ['high', 'medium', 'positive', 'info'];
const INVESTIGATION_STATUSES: InsightInvestigation['status'][] = [
    'idle',
    'running',
    'ready',
    'error',
];

const parseInvestigation = (value: unknown): InsightInvestigation | null => {
    if (!isRecord(value)) return null;
    if (
        !INVESTIGATION_STATUSES.includes(
            value.status as InsightInvestigation['status'],
        )
    ) {
        return null;
    }
    return {
        status: value.status as InsightInvestigation['status'],
        explanation:
            typeof value.explanation === 'string' ? value.explanation : null,
        partial: value.partial === true,
        threadUuid:
            typeof value.threadUuid === 'string' ? value.threadUuid : null,
        error: typeof value.error === 'string' ? value.error : null,
    };
};

const parseInsight = (value: unknown): Insight | null => {
    if (!isRecord(value)) return null;
    const investigation = parseInvestigation(value.investigation);
    if (
        typeof value.id !== 'string' ||
        typeof value.text !== 'string' ||
        typeof value.queryUuid !== 'string' ||
        typeof value.fieldId !== 'string' ||
        !SEVERITIES.includes(value.severity as InsightSeverity) ||
        !isStringRecord(value.dimensionValues) ||
        !investigation
    ) {
        return null;
    }
    return {
        id: value.id,
        severity: value.severity as InsightSeverity,
        text: value.text,
        queryUuid: value.queryUuid,
        fieldId: value.fieldId,
        dimensionValues: value.dimensionValues,
        expected: typeof value.expected === 'string' ? value.expected : null,
        actual: typeof value.actual === 'string' ? value.actual : null,
        investigation,
    };
};

/**
 * Validate a payload from the host. postMessage crosses a trust boundary, so
 * anything malformed is dropped rather than rendered.
 */
export const parseInsightsPayload = (value: unknown): InsightsPayload | null => {
    if (!isRecord(value)) return null;
    if (!STATUSES.includes(value.status as InsightsStatus)) return null;
    if (!Array.isArray(value.anomalies) || !Array.isArray(value.limitations)) {
        return null;
    }
    const anomalies = value.anomalies.map(parseInsight);
    if (anomalies.some((a) => a === null)) return null;
    return {
        status: value.status as InsightsStatus,
        analysisId:
            typeof value.analysisId === 'string' ? value.analysisId : null,
        headline: typeof value.headline === 'string' ? value.headline : null,
        summary: typeof value.summary === 'string' ? value.summary : null,
        limitations: value.limitations.filter(
            (l): l is string => typeof l === 'string',
        ),
        dataAsOf: typeof value.dataAsOf === 'string' ? value.dataAsOf : null,
        generatedAt:
            typeof value.generatedAt === 'string' ? value.generatedAt : null,
        stale: value.stale === true,
        canInvestigate: value.canInvestigate === true,
        error: typeof value.error === 'string' ? value.error : null,
        anomalies: anomalies as Insight[],
    };
};

type InsightsStore = {
    get: () => InsightsPayload;
    set: (payload: InsightsPayload) => void;
    subscribe: (listener: () => void) => () => void;
};

const createStore = (): InsightsStore => {
    let payload = EMPTY_INSIGHTS;
    const listeners = new Set<() => void>();
    return {
        get: () => payload,
        set: (next) => {
            payload = next;
            listeners.forEach((listener) => listener());
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
};

let sharedStore: InsightsStore | null = null;
const getStore = (): InsightsStore => {
    if (sharedStore === null) sharedStore = createStore();
    return sharedStore;
};

let hostWindow: Window | null = null;
let activeCleanup: (() => void) | null = null;

/**
 * Listen for the host's analysis and ask for the current one now. Called by
 * `createClient()` on the postMessage transport. One listener per bundle.
 */
export function mountInsights(targetWindow: Window): () => void {
    if (typeof window === 'undefined') return () => {};
    hostWindow = targetWindow;
    const store = getStore();
    const request: InsightsRequestMessage = { type: INSIGHTS_REQUEST_MESSAGE };
    const post = () => targetWindow.postMessage(request, '*');

    const handler = (event: MessageEvent) => {
        if (event.source !== targetWindow) return;
        const data = event.data as { type?: unknown; payload?: unknown };
        if (data?.type === SDK_READY_MESSAGE) {
            post();
            flushMountedQueries();
            return;
        }
        if (data?.type !== INSIGHTS_MESSAGE) return;
        const payload = parseInsightsPayload(data.payload);
        if (payload) store.set(payload);
    };

    activeCleanup?.();
    window.addEventListener('message', handler);
    const cleanup = () => {
        window.removeEventListener('message', handler);
        if (activeCleanup === cleanup) activeCleanup = null;
        if (hostWindow === targetWindow) hostWindow = null;
    };
    activeCleanup = cleanup;
    post();
    flushMountedQueries();
    return cleanup;
}

const postToHost = (message: InsightActionMessage | MountedQueriesMessage) => {
    hostWindow?.postMessage(message, '*');
};

export const postInsightAction = (action: InsightAction): void => {
    postToHost({ type: INSIGHT_ACTION_MESSAGE, ...action });
};

// ---- Mounted queries: which useLightdash results are on screen right now ----

const mounted = new Map<string, number>();
let flushScheduled = false;

function flushMountedQueries(): void {
    flushScheduled = false;
    postToHost({
        type: MOUNTED_QUERIES_MESSAGE,
        queryUuids: [...mounted.keys()],
    });
}

const scheduleFlush = () => {
    if (flushScheduled) return;
    flushScheduled = true;
    // Coalesce a render's worth of mounts and unmounts into one message.
    queueMicrotask(flushMountedQueries);
};

/** Count a query as on screen until the returned cleanup runs. */
export function registerMountedQuery(queryUuid: string): () => void {
    mounted.set(queryUuid, (mounted.get(queryUuid) ?? 0) + 1);
    scheduleFlush();
    return () => {
        const count = (mounted.get(queryUuid) ?? 1) - 1;
        if (count <= 0) mounted.delete(queryUuid);
        else mounted.set(queryUuid, count);
        scheduleFlush();
    };
}

// ---- Hooks ----

type InsightSource = {
    queryUuid: string | null;
    /** `format` from useLightdash, so formatted values match too. */
    format?: (row: Row, fieldId: string) => string;
};

export type ViewInsights = InsightsPayload & {
    /** Ask the host to analyse the current view (or re-analyse when stale). */
    analyse: () => void;
    investigate: (anomalyId: string) => void;
    /** Open the investigation's thread in Ask AI. */
    continueInAskAi: (anomalyId: string) => void;
};

export type QueryInsights = {
    status: InsightsStatus;
    /** Anomalies that refer to this query's rows. */
    anomalies: Insight[];
    /** The anomalies whose dimension values match this row, if any. */
    matches: (row: Row) => Insight[];
    canInvestigate: boolean;
    investigate: (anomalyId: string) => void;
    continueInAskAi: (anomalyId: string) => void;
};

/** Exported for tests; hooks wrap it. */
export const rowMatchesInsight = (
    row: Row,
    dimensionValues: Record<string, string>,
    format?: InsightSource['format'],
): boolean =>
    Object.entries(dimensionValues).every(([fieldId, value]) => {
        if (!(fieldId in row)) return false;
        const raw = row[fieldId];
        if (raw !== null && raw !== undefined && String(raw) === value) {
            return true;
        }
        return format ? format(row, fieldId) === value : false;
    });

function useInsightsPayload(): InsightsPayload {
    const store = getStore();
    return useSyncExternalStore(store.subscribe, store.get, () => EMPTY_INSIGHTS);
}

/**
 * The host's AI analysis of the current view.
 *
 *   const view = useInsights();               // executive summary + every anomaly
 *   const orders = useLightdash(ordersQuery);
 *   const insights = useInsights(orders);     // anomalies on this chart's rows
 *
 * Renders nothing on its own: read `status` and the fields, and call
 * `analyse()` / `investigate(id)` / `continueInAskAi(id)` from your own UI.
 */
export function useInsights(): ViewInsights;
export function useInsights(source: InsightSource): QueryInsights;
export function useInsights(
    source?: InsightSource,
): ViewInsights | QueryInsights {
    const payload = useInsightsPayload();
    const investigate = useCallback(
        (anomalyId: string) =>
            postInsightAction({ action: 'investigate', anomalyId }),
        [],
    );
    const continueInAskAi = useCallback(
        (anomalyId: string) =>
            postInsightAction({ action: 'continue', anomalyId }),
        [],
    );
    const analyse = useCallback(
        () => postInsightAction({ action: 'analyse' }),
        [],
    );

    const queryUuid = source?.queryUuid ?? null;
    const format = source?.format;
    const anomalies = useMemo(
        () =>
            source === undefined
                ? payload.anomalies
                : payload.anomalies.filter((a) => a.queryUuid === queryUuid),
        [payload.anomalies, queryUuid, source],
    );
    const matches = useCallback(
        (row: Row) =>
            anomalies.filter((a) =>
                rowMatchesInsight(row, a.dimensionValues, format),
            ),
        [anomalies, format],
    );

    if (source === undefined) {
        return { ...payload, analyse, investigate, continueInAskAi };
    }
    return {
        status: payload.status,
        anomalies,
        matches,
        canInvestigate: payload.canInvestigate,
        investigate,
        continueInAskAi,
    };
}

/** Report a mounted query for as long as the component is on screen. */
export function useMountedQuery(queryUuid: string | null): void {
    useEffect(() => {
        if (!queryUuid) return undefined;
        return registerMountedQuery(queryUuid);
    }, [queryUuid]);
}

/** Test-only: the payload currently held by the store. */
export function peekInsights(): InsightsPayload {
    return getStore().get();
}

/** Test-only seam. */
export function resetInsightsState(): void {
    activeCleanup?.();
    sharedStore = null;
    hostWindow = null;
    mounted.clear();
    flushScheduled = false;
}
