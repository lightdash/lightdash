import type { ChartKind } from './savedCharts';

export type ValidationResponseBase = {
    validationId: number;
    createdAt: Date;
    name: string;
    error: string;
    errorType: ValidationErrorType;
    projectUuid: string;
    spaceUuid?: string;
    source?: ValidationSourceType;
};

export type ValidationErrorChartResponse = ValidationResponseBase & {
    chartUuid: string | undefined; // NOTE: can be undefined if private content
    chartKind?: ChartKind;
    fieldName?: string;
    lastUpdatedBy?: string;
    lastUpdatedAt?: Date;
    chartViews: number;
    chartName?: string;
};

export type ValidationErrorDashboardResponse = ValidationResponseBase & {
    dashboardUuid: string | undefined; // NOTE: can be undefined if private content
    chartName?: string;
    fieldName?: string;
    lastUpdatedBy?: string;
    lastUpdatedAt?: Date;
    dashboardViews: number;
};

export type ValidationErrorTableResponse = Omit<
    ValidationResponseBase,
    'name'
> & {
    name: string | undefined;
};

export type ValidationResponse =
    | ValidationErrorChartResponse
    | ValidationErrorDashboardResponse
    | ValidationErrorTableResponse;

export type CreateTableValidation = Pick<
    ValidationErrorTableResponse,
    'error' | 'errorType' | 'projectUuid' | 'name' | 'source'
> & {
    modelName: string;
};

export type CreateChartValidation = Pick<
    ValidationErrorChartResponse,
    | 'error'
    | 'errorType'
    | 'fieldName'
    | 'name'
    | 'projectUuid'
    | 'chartUuid'
    | 'source'
    | 'chartName'
>;

export type CreateDashboardValidation = Pick<
    ValidationErrorDashboardResponse,
    | 'error'
    | 'errorType'
    | 'fieldName'
    | 'name'
    | 'projectUuid'
    | 'dashboardUuid'
    | 'chartName'
    | 'source'
>;

export type CreateValidation =
    | CreateTableValidation
    | CreateChartValidation
    | CreateDashboardValidation;

export type ApiValidateResponse = {
    status: 'ok';
    results: ValidationResponse[];
};

export type ApiValidationDismissResponse = {
    status: 'ok';
};

export type ValidationSummary = Pick<
    ValidationResponse,
    'error' | 'createdAt' | 'validationId'
>;

export enum ValidationErrorType {
    Chart = 'chart',
    Sorting = 'sorting',
    Filter = 'filter',
    Metric = 'metric',
    Model = 'model',
    Dimension = 'dimension',
    CustomMetric = 'custom metric',
}

export enum ValidationSourceType {
    Chart = 'chart',
    Dashboard = 'dashboard',
    Table = 'table',
}

export const isTableValidationError = (
    error: ValidationResponse | CreateValidation,
): error is ValidationErrorTableResponse | CreateTableValidation =>
    error.source === ValidationSourceType.Table;

export const isChartValidationError = (
    error: ValidationResponse | CreateValidation,
): error is ValidationErrorChartResponse | CreateChartValidation =>
    error.source === ValidationSourceType.Chart;

export const isDashboardValidationError = (
    error: ValidationResponse | CreateValidation,
): error is ValidationErrorDashboardResponse | CreateDashboardValidation =>
    error.source === ValidationSourceType.Dashboard;

export enum ValidationTarget {
    CHARTS = 'charts',
    DASHBOARDS = 'dashboards',
    TABLES = 'tables',
}

export function isValidationTargetValid(validationTarget: string) {
    return Object.values(ValidationTarget).includes(
        validationTarget as ValidationTarget,
    );
}
