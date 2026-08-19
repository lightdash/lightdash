import type { ApiSuccess } from './api/success';
import type { KnexPaginatedData } from './knex-paginate';
import type { ChartKind } from './savedCharts';

export type ValidationResponseBase = {
    validationUuid: string;
    /**
     * @deprecated Use `validationUuid`. The integer `validationId` is null
     * for validations created after the UUID migration (PROD-7386).
     */
    validationId: number | null;
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
    tableName?: string; // The model/explore the broken field or chart belongs to
    lastUpdatedBy?: string;
    lastUpdatedAt?: Date;
    chartViews: number;
    chartName?: string;
};

export type ValidationErrorDashboardResponse = ValidationResponseBase & {
    dashboardUuid: string | undefined; // NOTE: can be undefined if private content
    dashboardSlug?: string;
    chartName?: string;
    fieldName?: string;
    tableName?: string; // For dashboard filter errors referencing specific tables
    dashboardFilterErrorType?: DashboardFilterValidationErrorType;
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

export type ValidationErrorDataAppResponse = ValidationResponseBase & {
    source: ValidationSourceType.DataApp;
    appUuid: string | undefined; // NOTE: can be undefined if private content
    fieldName?: string;
    modelName?: string;
    lastUpdatedBy?: string;
    lastUpdatedAt?: Date;
};

export type ValidationResponse =
    | ValidationErrorChartResponse
    | ValidationErrorDashboardResponse
    | ValidationErrorTableResponse
    | ValidationErrorDataAppResponse;

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
    | 'tableName'
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
    | 'tableName'
    | 'name'
    | 'projectUuid'
    | 'dashboardUuid'
    | 'chartName'
    | 'source'
>;

export type CreateDataAppValidation = Omit<
    Pick<
        ValidationErrorDataAppResponse,
        | 'appUuid'
        | 'error'
        | 'errorType'
        | 'fieldName'
        | 'modelName'
        | 'name'
        | 'projectUuid'
        | 'source'
    >,
    'appUuid'
> & { appUuid: string };

export type CreateValidation =
    | CreateTableValidation
    | CreateChartValidation
    | CreateDashboardValidation
    | CreateDataAppValidation;

/** @deprecated Use ApiPaginatedValidateResponse with GET /validate/list instead */
export type ApiValidateResponse = {
    status: 'ok';
    results: ValidationResponse[];
};

export type ApiPaginatedValidateResponse = ApiSuccess<
    KnexPaginatedData<ValidationResponse[]>
>;

export type ApiSingleValidationResponse = ApiSuccess<ValidationResponse>;

export type ApiValidationDismissResponse = {
    status: 'ok';
};

export type ApiChartValidationResponse = ApiSuccess<{
    errors: CreateChartValidation[];
}>;

export type ApiDashboardValidationResponse = ApiSuccess<{
    errors: CreateDashboardValidation[];
}>;

export type ValidationSummary = Pick<
    ValidationResponse,
    'error' | 'createdAt' | 'validationUuid' | 'validationId'
>;

export type ValidationAffectedContent = {
    uuid: string | null; // null when content is private or deleted for this user
    name: string;
    source: ValidationSourceType;
    views: number;
    errorCount: number;
};

export type ValidationErrorGroup = {
    groupKey: string;
    errorType: ValidationErrorType;
    tableName: string | null; // root-cause model, when known
    fieldName: string | null; // set for field-level groups
    errorCount: number;
    affectedCharts: number;
    affectedDashboards: number;
    affectedTables: number;
    affectedDataApps: number;
    sampleError: string;
    affectedContent: ValidationAffectedContent[]; // capped, see hasMoreAffectedContent
    hasMoreAffectedContent: boolean;
};

export type ValidationGroupedSummary = {
    totalErrors: number;
    totalAffectedItems: number;
    groups: ValidationErrorGroup[];
};

export type ApiValidationSummaryResponse = ApiSuccess<ValidationGroupedSummary>;

export enum ValidationErrorType {
    Chart = 'chart',
    Sorting = 'sorting',
    Filter = 'filter',
    Metric = 'metric',
    Model = 'model',
    Dimension = 'dimension',
    CustomMetric = 'custom metric',
    ChartConfiguration = 'chart configuration',
}

export enum DashboardFilterValidationErrorType {
    FieldDoesNotExist = 'field_does_not_exist',
    FieldTableMismatch = 'field_table_mismatch',
    TableNotUsedByAnyChart = 'table_not_used_by_any_chart',
    TableDoesNotExist = 'table_does_not_exist',
}

export enum ValidationSourceType {
    Chart = 'chart',
    Dashboard = 'dashboard',
    DataApp = 'data_app',
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

export const isDataAppValidationError = (
    error: ValidationResponse | CreateValidation,
): error is ValidationErrorDataAppResponse | CreateDataAppValidation =>
    error.source === ValidationSourceType.DataApp;

/**
 * Checks if a dashboard validation error is fixable via rename.
 * Fixable: FieldDoesNotExist (field renamed), TableDoesNotExist (model renamed),
 * FieldTableMismatch (field doesn't match table after model rename).
 */
export const isFixableDashboardValidationError = (
    error: ValidationResponse,
): error is ValidationErrorDashboardResponse =>
    isDashboardValidationError(error) &&
    !!error.dashboardUuid &&
    !!error.dashboardFilterErrorType &&
    (error.dashboardFilterErrorType ===
        DashboardFilterValidationErrorType.FieldDoesNotExist ||
        error.dashboardFilterErrorType ===
            DashboardFilterValidationErrorType.TableDoesNotExist ||
        error.dashboardFilterErrorType ===
            DashboardFilterValidationErrorType.FieldTableMismatch);

export enum ValidationTarget {
    APPS = 'apps',
    CHARTS = 'charts',
    DASHBOARDS = 'dashboards',
    TABLES = 'tables',
}

export function isValidationTargetValid(validationTarget: string) {
    return Object.values(ValidationTarget).includes(
        validationTarget as ValidationTarget,
    );
}
