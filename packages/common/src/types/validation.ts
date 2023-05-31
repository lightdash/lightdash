import type { ChartKind } from './savedCharts';

type ValidationResponseBase = {
    validationId: number;
    createdAt: Date;
    name: string;
    error: string;
    errorType?: ValidationErrorType;
    projectUuid: string;
    spaceUuid?: string;
};

export type ValidationErrorChartResponse = ValidationResponseBase & {
    chartUuid: string | undefined; // NOTE: can be undefined if private content
    chartType?: ChartKind;
    fieldName?: string;
    lastUpdatedBy?: string;
    lastUpdatedAt?: Date;
    chartViews: number;
};

export type ValidationErrorDashboardResponse = ValidationResponseBase & {
    dashboardUuid: string | undefined; // NOTE: can be undefined if private content
    chartName?: string;
    fieldName?: string;
    lastUpdatedBy?: string;
    lastUpdatedAt?: Date;
    dashboardViews: number;
};

export type ValidationErrorTableResponse = ValidationResponseBase & {
    modelName: string | undefined;
    dimensionName: string | undefined;
};

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

export enum ValidationErrorType {
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
    !('chartUuid' in error && error.chartUuid) &&
    !('dashboardUuid' in error && error.dashboardUuid);

export const isChartValidationError = (
    error: ValidationResponse | CreateValidation,
): error is ValidationErrorChartResponse | CreateChartValidation =>
    'chartUuid' in error;

export const isDashboardValidationError = (
    error: ValidationResponse | CreateValidation,
): error is ValidationErrorDashboardResponse | CreateDashboardValidation =>
    'dashboardUuid' in error;
