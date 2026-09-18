import type { ApiSuccess } from '../../types/api/success';
import type { TraceTaskBase } from '../../types/scheduler';

/** One query the host captured for the viewer's current view of a data app. */
export type DataAppAnalysisSource = {
    queryUuid: string;
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
    error: string | null;
    anomalies: (DataAppAnomaly & {
        investigation: DataAppInsightInvestigation;
    })[];
};
