import type { ApiSuccess } from '../../types/api/success';
import type { UUID } from '../../types/api/uuid';
import type { TraceTaskBase } from '../../types/scheduler';

/** Whether an app analyses on load: its own choice, or the org default. */
export type DataAppAutoAnalysis = 'inherit' | 'on' | 'off';

const DATA_APP_AUTO_ANALYSIS: ReadonlySet<string> = new Set([
    'inherit',
    'on',
    'off',
]);

export const isDataAppAutoAnalysis = (
    value: unknown,
): value is DataAppAutoAnalysis =>
    typeof value === 'string' && DATA_APP_AUTO_ANALYSIS.has(value);

/** A stored value outside the set reads back as the org default. */
export const normalizeDataAppAutoAnalysis = (
    value: unknown,
): DataAppAutoAnalysis => (isDataAppAutoAnalysis(value) ? value : 'inherit');

/** One query the host captured for the viewer's current view of a data app. */
/**
 * Org-configurable ceilings for AI analysis in data apps. Per-run limits
 * bound one investigation; daily caps bound model runs per organization per
 * UTC day (null = no cap). On a Lightdash-managed key the daily caps cannot
 * exceed the defaults.
 */
export type DataAppAnalysisLimits = {
    investigateMaxSteps: number;
    investigateMaxWarehouseQueries: number;
    dailyDetectCap: number | null;
    dailyInvestigateCap: number | null;
    dailyPromptCap: number | null;
};

export const DATA_APP_ANALYSIS_DEFAULT_LIMITS: DataAppAnalysisLimits = {
    investigateMaxSteps: 12,
    investigateMaxWarehouseQueries: 15,
    dailyDetectCap: 300,
    dailyInvestigateCap: 100,
    dailyPromptCap: 500,
};

export type DataAppAnalysisSource = {
    queryUuid: UUID;
    label: string | null;
};

export type DataAppAnomalySeverity = 'high' | 'medium' | 'positive' | 'info';

/**
 * A notable data point found by `detect`. `queryUuid` + `fieldId` +
 * `dimensionValues` identify the row it refers to, so the host can highlight
 * the chart and `investigate` can key on `id`.
 */
export type DataAppAnomaly = {
    /** Deterministic: hash of queryUuid, fieldId and dimensionValues. */
    id: string;
    severity: DataAppAnomalySeverity;
    text: string;
    queryUuid: string;
    fieldId: string;
    /** Dimension field id → value as shown in the results. */
    dimensionValues: Record<string, string>;
    expected: string | null;
    actual: string | null;
};

export type DataAppDetectResult = {
    headline: string;
    summary: string;
    anomalies: DataAppAnomaly[];
    /** What the model could not assess: missing comparisons, truncation, etc. */
    limitations: string[];
    /** Period or snapshot the analysed data covers, in the model's words. */
    dataAsOf: string | null;
};

export type DataAppDetectRequest = {
    sources: DataAppAnalysisSource[];
    instructions?: string;
    /** Run the model even when an analysis of identical rows exists. */
    force?: boolean;
};

export type DataAppLookupRequest = {
    sources: DataAppAnalysisSource[];
    instructions?: string;
};

export type DataAppAnalysis = DataAppDetectResult & {
    analysisId: string;
    appUuid: string;
    appVersion: number;
    sources: DataAppAnalysisSource[];
    generatedAt: Date;
};

export type ApiDataAppDetectResponse = ApiSuccess<DataAppAnalysis>;

export type DataAppInvestigateRequest = {
    anomalyId: string;
    agentUuid: string;
};

/**
 * An agent's take on one anomaly: possible drivers and the evidence behind
 * them, never a causal claim. `partial` is set when the query budget ran out.
 */
export type DataAppInvestigateResult = {
    explanation: string;
    anomaly: DataAppAnomaly;
    agentUuid: string;
    threadUuid: string;
    queriesRun: number;
    partial: boolean;
};

export type DataAppInvestigation = DataAppInvestigateResult & {
    investigationId: string;
    analysisId: string;
    appUuid: string;
    appVersion: number;
    generatedAt: Date;
};

/** Job that runs an investigation off the request path; poll by jobId. */
export type DataAppInvestigateJobPayload = TraceTaskBase & {
    appUuid: string;
    analysisId: string;
    anomalyId: string;
    agentUuid: string;
};

export type ApiDataAppInvestigateResponse = ApiSuccess<{ jobId: string }>;

/**
 * A free-form question an app asks about the viewer's own query results.
 * `focus` narrows the question to one row (field id → value as shown).
 */
export type DataAppPromptRequest = {
    prompt: string;
    sources: DataAppAnalysisSource[];
    focus?: Record<string, string>;
};

export type DataAppPromptResult = {
    prompt: string;
    focus: Record<string, string> | null;
    text: string;
};

export type DataAppPromptAnswer = DataAppPromptResult & {
    promptId: string;
    appUuid: string;
    appVersion: number;
    sources: DataAppAnalysisSource[];
    generatedAt: Date;
};

export type ApiDataAppPromptResponse = ApiSuccess<DataAppPromptAnswer>;

/** A stored analysis of exactly the rows the viewer sees now, with its investigations. */
export type DataAppAnalysisLookup = {
    analysis: DataAppAnalysis;
    investigations: DataAppInvestigation[];
};

export type ApiDataAppAnalysisLookupResponse =
    ApiSuccess<DataAppAnalysisLookup | null>;

export type DataAppAnalysisRecord =
    | ({ operation: 'detect' } & DataAppAnalysis)
    | ({ operation: 'investigate' } & DataAppInvestigation)
    | ({ operation: 'prompt' } & DataAppPromptAnswer);

export type ApiDataAppAnalysisResponse = ApiSuccess<DataAppAnalysisRecord>;

/** Per-anomaly investigation state as pushed into the app. */
export type DataAppInsightInvestigation = {
    status: 'idle' | 'running' | 'ready' | 'error';
    explanation: string | null;
    partial: boolean;
    threadUuid: string | null;
    error: string | null;
};

/**
 * The analysis of the current view as the host pushes it into the app over
 * postMessage. Shape mirrors `InsightsPayload` in the query SDK.
 */
export type DataAppInsightsPayload = {
    status: 'idle' | 'analysing' | 'ready' | 'error' | 'unavailable';
    analysisId: string | null;
    headline: string | null;
    summary: string | null;
    limitations: string[];
    dataAsOf: string | null;
    generatedAt: string | null;
    stale: boolean;
    canInvestigate: boolean;
    /** False when the org keeps viewers at the explanation. */
    canContinue: boolean;
    error: string | null;
    anomalies: (DataAppAnomaly & {
        investigation: DataAppInsightInvestigation;
    })[];
};
