import type { ApiSuccess } from '../../types/api/success';

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
};

export type DataAppAnalysis = DataAppDetectResult & {
    analysisId: string;
    appUuid: string;
    appVersion: number;
    sources: DataAppAnalysisSource[];
    generatedAt: Date;
};

export type ApiDataAppDetectResponse = ApiSuccess<DataAppAnalysis>;
