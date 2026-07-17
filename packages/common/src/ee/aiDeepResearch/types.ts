import { type ApiSuccess } from '../../types/api/success';
import { type ItemsMap } from '../../types/field';
import { type MetricQuery } from '../../types/metricQuery';

export const AI_DEEP_RESEARCH_RUN_STATUSES = [
    'queued',
    'running',
    'completed',
    'partially_completed',
    'failed',
    'cancelled',
] as const;

export type AiDeepResearchRunStatus =
    (typeof AI_DEEP_RESEARCH_RUN_STATUSES)[number];

export const AI_DEEP_RESEARCH_TERMINAL_STATUSES = [
    'completed',
    'partially_completed',
    'failed',
    'cancelled',
] as const satisfies readonly AiDeepResearchRunStatus[];

export type AiDeepResearchTerminalStatus =
    (typeof AI_DEEP_RESEARCH_TERMINAL_STATUSES)[number];

export const isAiDeepResearchRunTerminal = (
    status: AiDeepResearchRunStatus,
): status is AiDeepResearchTerminalStatus =>
    AI_DEEP_RESEARCH_TERMINAL_STATUSES.includes(
        status as AiDeepResearchTerminalStatus,
    );

export type AiDeepResearchBudget = {
    maxRuntimeMs: number;
    maxTokens: number;
    maxToolCalls: number;
    maxWarehouseQueries: number;
    maxResultRows: number;
};

export const AI_DEEP_RESEARCH_EFFORTS = [
    'low',
    'medium',
    'high',
    'xhigh',
] as const;

export type AiDeepResearchEffort = (typeof AI_DEEP_RESEARCH_EFFORTS)[number];

export type AiDeepResearchRequestBody = {
    prompt: string;
    /** Server-owned execution budget tier. Defaults to medium. */
    effort?: AiDeepResearchEffort;
    /** Agent thread to attach the run to. Must be owned by the caller. */
    threadUuid?: string;
    /** Thread message that captured this prompt. Requires threadUuid. */
    promptUuid?: string;
};

export const AI_DEEP_RESEARCH_CONFIDENCE_LEVELS = [
    'low',
    'medium',
    'high',
] as const;

export type AiDeepResearchConfidence =
    (typeof AI_DEEP_RESEARCH_CONFIDENCE_LEVELS)[number];

export type AiDeepResearchChartConfig = {
    defaultVizType:
        | 'table'
        | 'bar'
        | 'horizontal'
        | 'line'
        | 'scatter'
        | 'pie'
        | 'funnel';
    xAxisDimension: string | null;
    yAxisMetrics: string[] | null;
    groupBy: string[] | null;
    xAxisType: 'category' | 'time' | null;
    stackBars: boolean | null;
    lineType: 'line' | 'area' | null;
    funnelDataInput: 'row' | 'column' | null;
    xAxisLabel: string;
    yAxisLabel: string;
    secondaryYAxisMetric: string | null;
    secondaryYAxisLabel: string | null;
};

export type AiDeepResearchChartSnapshotValue = string | number | boolean | null;

/** The rendered dataset of a report chart, frozen at publish time. */
export type AiDeepResearchChartSnapshot = {
    takenAt: string;
    rowCount: number;
    truncated: boolean;
    /** Field ids ordering the values in each row. */
    columnOrder: string[];
    /** Raw row values ordered by `columnOrder`; formatted client-side. */
    rows: AiDeepResearchChartSnapshotValue[][];
};

/**
 * Everything the UI needs to render one report chart, keyed by chart key in
 * `AiDeepResearchRun.resultChartData`. Written entirely by the backend at
 * publish time; the markdown only carries [title](#chart-<key>) references.
 */
export type AiDeepResearchChartData = {
    source: 'warehouse' | 'inline';
    title: string;
    chartConfig: AiDeepResearchChartConfig;
    /** Warehouse charts: the verified execution this chart is evidence of. */
    queryUuid: string | null;
    /** Inline charts: verified executions the data was derived from. */
    derivedFrom: string[] | null;
    /** Real for warehouse charts, synthesized for inline ones. */
    metricQuery: MetricQuery;
    /** Selected + filter fields; drives labels and value formatting. */
    fields: ItemsMap;
    /** Null only for reports persisted before snapshots existed. */
    snapshot: AiDeepResearchChartSnapshot | null;
};

export type AiDeepResearchChartDataMap = Record<
    string,
    AiDeepResearchChartData
>;

export const AI_DEEP_RESEARCH_EVENT_TYPES = [
    'status_changed',
    'cancellation_requested',
    'progress',
] as const;

export type AiDeepResearchEventType =
    (typeof AI_DEEP_RESEARCH_EVENT_TYPES)[number];

export const AI_DEEP_RESEARCH_PHASES = [
    'planning',
    'investigating',
    'validating',
    'synthesizing',
] as const;

export type AiDeepResearchPhase = (typeof AI_DEEP_RESEARCH_PHASES)[number];

export const AI_DEEP_RESEARCH_ACTIVITIES = [
    'lightdash_metadata',
    'warehouse_query',
    'web_search',
    'web_fetch',
    'reporting',
] as const;

export type AiDeepResearchActivity =
    (typeof AI_DEEP_RESEARCH_ACTIVITIES)[number];

export type AiDeepResearchProgress = {
    phase: AiDeepResearchPhase;
    activity: AiDeepResearchActivity | null;
    current: number | null;
    total: number | null;
};

export type AiDeepResearchEventPayloadMap = {
    status_changed: { status: AiDeepResearchRunStatus };
    cancellation_requested: Record<string, never>;
    progress: { progress: AiDeepResearchProgress };
};

export type AiDeepResearchEventPayload =
    | { status: AiDeepResearchRunStatus }
    | Record<string, never>
    | { progress: AiDeepResearchProgress };

// TSOA cannot resolve the equivalent mapped/indexed discriminated union.
export type AiDeepResearchEvent =
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'status_changed';
          payload: { status: AiDeepResearchRunStatus };
          createdAt: string;
      }
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'cancellation_requested';
          payload: Record<string, never>;
          createdAt: string;
      }
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'progress';
          payload: { progress: AiDeepResearchProgress };
          createdAt: string;
      };

export type AiDeepResearchRun = {
    aiDeepResearchRunUuid: string;
    projectUuid: string;
    aiThreadUuid: string | null;
    promptUuid: string | null;
    prompt: string;
    status: AiDeepResearchRunStatus;
    /** The report narrative with [title](#chart-<key>) chart references. */
    resultMarkdown: string | null;
    /** Render data for each referenced chart, keyed by chart key. */
    resultChartData: AiDeepResearchChartDataMap | null;
    budget: AiDeepResearchBudget;
    errorMessage: string | null;
    cancellationRequestedAt: string | null;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    completedAt: string | null;
};

export type AiDeepResearchEventsPage = {
    events: AiDeepResearchEvent[];
    nextCursor: string | null;
};

export type ApiAiDeepResearchRunResponse = ApiSuccess<AiDeepResearchRun>;

export type ApiAiDeepResearchRunListResponse = ApiSuccess<AiDeepResearchRun[]>;

export type ApiAiDeepResearchEventsResponse =
    ApiSuccess<AiDeepResearchEventsPage>;

export type AiDeepResearchJobPayload = {
    aiDeepResearchRunUuid: string;
};
