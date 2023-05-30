import type { ChartKind } from './savedCharts';

type ValidationResponseBase = {
    validationId: number;
    createdAt: Date;
    name: string;
    error: string;
    errorType: ErrorType | null;
    projectUuid: string;
    spaceUuid?: string;

    // TODO: refactor these
} & {
    chartName?: string | null;
    fieldName?: string | null;
    modelName?: string | null;
    dimensionName?: string | null;
};

export type ValidationErrorChartResponse = ValidationResponseBase & {
    chartUuid: string;
    chartType?: ChartKind;
    lastUpdatedBy?: string;
    lastUpdatedAt?: Date;
};

export type ValidationErrorDashboardResponse = ValidationResponseBase & {
    dashboardUuid: string;
    lastUpdatedBy?: string;
    lastUpdatedAt?: Date;
};

export type ValidationErrorTableResponse = ValidationResponseBase;

export type ValidationResponse =
    | ValidationErrorChartResponse
    | ValidationErrorDashboardResponse
    | ValidationErrorTableResponse;

export type CreateTableValidation = Pick<
    ValidationErrorTableResponse,
    | 'error'
    | 'errorType'
    | 'modelName'
    | 'dimensionName'
    | 'projectUuid'
    | 'name'
>;

export type CreateChartValidation = Pick<
    ValidationErrorChartResponse,
    'error' | 'errorType' | 'fieldName' | 'name' | 'projectUuid' | 'chartUuid'
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
>;

export type CreateValidation =
    | CreateTableValidation
    | CreateChartValidation
    | CreateDashboardValidation;

export type ApiValidateResponse = {
    status: 'ok';
    results: ValidationResponse[];
};

export type ValidationSummary = Pick<
    ValidationResponse,
    'error' | 'createdAt' | 'validationId'
>;

export enum ErrorType {
    Chart = 'chart',
    Sorting = 'sorting',
    Filter = 'filter',
    Metric = 'metric',
    Model = 'model',
    Dimension = 'dimension',
}

export const isTableValidationError = (
    error: ValidationResponse | CreateValidation,
): error is ValidationErrorTableResponse | CreateTableValidation =>
    !('chartUuid' in error && 'dashboardUuid' in error);

export const isChartValidationError = (
    error: ValidationResponse | CreateValidation,
): error is ValidationErrorChartResponse | CreateChartValidation =>
    'chartUuid' in error && !!error.chartUuid;

export const isDashboardValidationError = (
    error: ValidationResponse | CreateValidation,
): error is ValidationErrorDashboardResponse | CreateDashboardValidation =>
    'dashboardUuid' in error && !!error.dashboardUuid;
