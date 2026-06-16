import type { DBFieldTypes } from './api';

/**
 * Severity of changing/removing a semantic-layer field, derived from its exact
 * blast radius across saved content. `breaking` means at least one chart,
 * dependent metric, or dashboard filter references the field and would break on
 * removal; `safe` means nothing references it.
 *
 * Note: this does NOT capture silent value-drift (same field id, changed SQL or
 * aggregation) — that requires comparing query results, not field references.
 */
export enum FieldImpactSeverity {
    Breaking = 'breaking',
    Safe = 'safe',
}

export type FieldImpactChart = {
    uuid: string;
    name: string;
    fieldType: DBFieldTypes;
    viewsCount: number;
    spaceUuid: string;
    spaceName: string;
    /** Set when the chart lives inside a dashboard rather than a space. */
    dashboardUuid: string | null;
    dashboardName: string | null;
};

export type FieldImpactDashboard = {
    uuid: string;
    name: string;
    /** Name of an impacted chart that places this dashboard in the blast radius. */
    viaChartName: string;
};

export type FieldImpactDashboardFilter = {
    uuid: string;
    name: string;
};

export type FieldImpactDependentMetric = {
    fieldId: string;
    tableName: string;
    name: string;
};

export type FieldImpactScheduledDelivery = {
    name: string;
    savedChartUuid: string | null;
    dashboardUuid: string | null;
};

export type FieldImpactSummary = {
    charts: number;
    dashboards: number;
    dashboardFilterTargets: number;
    metricTreeDependents: number;
    scheduledDeliveries: number;
};

/**
 * Exact impact of changing/removing a single semantic-layer field, computed from
 * the field-reference tables Lightdash already maintains (no fuzzy search).
 */
export type FieldImpactReport = {
    projectUuid: string;
    fieldId: string;
    /** null when nothing references the field, so its type can't be inferred. */
    fieldType: DBFieldTypes | null;
    severity: FieldImpactSeverity;
    summary: FieldImpactSummary;
    charts: FieldImpactChart[];
    dashboards: FieldImpactDashboard[];
    dashboardFilterTargets: FieldImpactDashboardFilter[];
    metricTreeDependents: FieldImpactDependentMetric[];
    scheduledDeliveries: FieldImpactScheduledDelivery[];
};
