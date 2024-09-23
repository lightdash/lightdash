import type {
    AllVizChartConfig,
    ChartKind,
    Dashboard,
    LightdashUser,
    Organization,
    Project,
    SpaceSummary,
    VizChartConfig,
} from '..';
import assertUnreachable from '../utils/assertUnreachable';
import { type FieldType } from './field';
import { type SchedulerJobStatus } from './scheduler';

export type SemanticLayerView = {
    name: string;
    label: string;
    description?: string;
    visible: boolean;
};

export enum SemanticLayerFieldType {
    TIME = 'time',
    NUMBER = 'number',
    STRING = 'string',
    BOOLEAN = 'boolean',
}

export enum SemanticLayerTimeGranularity {
    NANOSECOND = 'NANOSECOND',
    MICROSECOND = 'MICROSECOND',
    MILLISECOND = 'MILLISECOND',
    SECOND = 'SECOND',
    MINUTE = 'MINUTE',
    HOUR = 'HOUR',
    DAY = 'DAY',
    WEEK = 'WEEK',
    MONTH = 'MONTH',
    QUARTER = 'QUARTER',
    YEAR = 'YEAR',
}

export enum SemanticLayerSortByDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

// TODO: should we separate metric and dimension fields?
export type SemanticLayerField = {
    name: string;
    label: string;
    type: SemanticLayerFieldType;
    kind: FieldType;
    description?: string;
    visible: boolean;
    aggType?: string; // eg: count, sum
    availableGranularities: SemanticLayerTimeGranularity[];
    availableOperators: SemanticLayerFilter['operator'][];
};

export type SemanticLayerTimeDimension = SemanticLayerField & {
    granularity?: SemanticLayerTimeGranularity;
};

export type SemanticLayerSortBy = Pick<SemanticLayerField, 'name' | 'kind'> & {
    direction: SemanticLayerSortByDirection;
};

export type SemanticLayerPivot = {
    on: string[];
    index: string[];
    values: string[];
};

export type SemanticLayerQuery = {
    dimensions: Pick<SemanticLayerField, 'name'>[];
    timeDimensions: Pick<SemanticLayerTimeDimension, 'name' | 'granularity'>[];
    metrics: Pick<SemanticLayerField, 'name'>[];
    sortBy: SemanticLayerSortBy[];
    limit?: number;
    timezone?: string;
    pivot?: SemanticLayerPivot;
    filters: SemanticLayerFilter[];
};

export type SemanticLayerResultRow = Record<
    string,
    string | number | boolean | null
>;

export interface SemanticLayerTransformer<
    ViewType,
    QueryType,
    DimensionsType,
    MetricsType,
    ResultsType,
    SqlType,
> {
    fieldsToSemanticLayerFields: (
        dimensions: DimensionsType,
        metrics: MetricsType,
    ) => SemanticLayerField[];
    viewsToSemanticLayerViews: (views: ViewType[]) => SemanticLayerView[];
    semanticLayerQueryToQuery: (query: SemanticLayerQuery) => QueryType;
    resultsToResultRows: (results: ResultsType) => SemanticLayerResultRow[];
    sqlToString: (sql: SqlType) => string;
    mapResultsKeys: (key: string, query: SemanticLayerQuery) => string;
}

export interface SemanticLayerClientInfo {
    name: string;
    features: {
        views: boolean;
    };
    config: {
        maxQueryLimit: number;
    };
}

export interface ApiSemanticLayerClientInfo {
    status: 'ok';
    results: SemanticLayerClientInfo;
}

export interface SemanticLayerClient {
    getClientInfo: () => SemanticLayerClientInfo;
    getViews: () => Promise<SemanticLayerView[]>;
    getFields: (
        viewName: string,
        selectedFields: Pick<
            SemanticLayerQuery,
            'dimensions' | 'timeDimensions' | 'metrics'
        >,
    ) => Promise<SemanticLayerField[]>;
    streamResults: (
        projectUuid: string,
        query: SemanticLayerQuery,
        callback: (results: SemanticLayerResultRow[]) => void,
    ) => Promise<number>;
    getSql: (query: SemanticLayerQuery) => Promise<string>;
    getMaxQueryLimit: () => number;
}

export type SemanticLayerQueryPayload = {
    projectUuid: string;
    userUuid: string;
    query: SemanticLayerQuery;
    context: 'semanticViewer';
};

// Helper functions and constants
const SEMANTIC_LAYER_DEFAULT_QUERY_LIMIT = 500;

export const isSemanticLayerTimeDimension = (
    field: SemanticLayerField,
): field is SemanticLayerTimeDimension => 'granularity' in field;

export function getDefaultedLimit(
    maxQueryLimit: number,
    queryLimit?: number,
): number {
    return Math.min(
        queryLimit ?? SEMANTIC_LAYER_DEFAULT_QUERY_LIMIT,
        maxQueryLimit,
    );
}

// Semantic Layer Scheduler Job

export const semanticLayerQueryJob = 'semanticLayer';

export type SemanticLayerJobStatusSuccessDetails = {
    fileUrl: string;
    columns: string[];
};

export type SemanticLayerJobStatusErrorDetails = {
    error: string;
    createdByUserUuid: string;
};

export type ApiSemanticLayerJobStatusResponse = {
    status: 'ok';
    results:
        | {
              status: SchedulerJobStatus.SCHEDULED;
              details?: undefined;
          }
        | {
              status: SchedulerJobStatus.STARTED;
              details?: undefined;
          }
        | {
              status: SchedulerJobStatus.COMPLETED;
              details: SemanticLayerJobStatusSuccessDetails;
          }
        | {
              status: SchedulerJobStatus.ERROR;
              details: SemanticLayerJobStatusErrorDetails;
          };
};

export type ApiSemanticLayerJobSuccessResponse =
    ApiSemanticLayerJobStatusResponse & {
        results: {
            status: SchedulerJobStatus.COMPLETED;
            details: SemanticLayerJobStatusSuccessDetails;
        };
    };

// Semantic Layer Filters

export enum SemanticLayerFilterBaseOperator {
    IS = 'IS',
    IS_NOT = 'IS_NOT',
}

export enum SemanticLayerFilterRelativeTimeValue {
    TODAY = 'TODAY',
    YESTERDAY = 'YESTERDAY',
    LAST_7_DAYS = 'LAST_7_DAYS',
    LAST_30_DAYS = 'LAST_30_DAYS',
}

export type SemanticLayerFilterBase = {
    uuid: string;
    fieldRef: string;
    fieldKind: FieldType; // This is mostly to help with frontend state and avoiding having to set all the fields in redux to be able to find the kind
    fieldType: SemanticLayerFieldType;
};

export type SemanticLayerStringFilter = SemanticLayerFilterBase & {
    fieldType: SemanticLayerFieldType.STRING;
    operator: SemanticLayerFilterBaseOperator;
    values: string[];
};

export type SemanticLayerExactTimeFilter = SemanticLayerFilterBase & {
    fieldType: SemanticLayerFieldType.TIME;
    operator: SemanticLayerFilterBaseOperator;
    values: { time: string };
};

export type SemanticLayerRelativeTimeFilter = SemanticLayerFilterBase & {
    fieldType: SemanticLayerFieldType.TIME;
    operator: SemanticLayerFilterBaseOperator;
    values: { relativeTime: SemanticLayerFilterRelativeTimeValue };
};

export type SemanticLayerTimeFilter =
    | SemanticLayerExactTimeFilter
    | SemanticLayerRelativeTimeFilter;

type SemanticLayerFilterTypes =
    | SemanticLayerStringFilter
    | SemanticLayerTimeFilter;

export type SemanticLayerFilter = SemanticLayerFilterTypes & {
    and?: SemanticLayerFilter[];
    or?: SemanticLayerFilter[];
};

export const isSemanticLayerBaseOperator = (
    operator: SemanticLayerFilter['operator'],
): operator is SemanticLayerFilterBaseOperator =>
    operator === SemanticLayerFilterBaseOperator.IS ||
    operator === SemanticLayerFilterBaseOperator.IS_NOT;

export function isSemanticLayerRelativeTimeValue(
    value: string,
): value is SemanticLayerFilterRelativeTimeValue {
    return (
        value === SemanticLayerFilterRelativeTimeValue.TODAY ||
        value === SemanticLayerFilterRelativeTimeValue.YESTERDAY ||
        value === SemanticLayerFilterRelativeTimeValue.LAST_7_DAYS ||
        value === SemanticLayerFilterRelativeTimeValue.LAST_30_DAYS
    );
}

export function isSemanticLayerRelativeTimeFilter(
    filter: Pick<SemanticLayerFilter, 'fieldType' | 'values'>,
): filter is SemanticLayerRelativeTimeFilter {
    return (
        filter.fieldType === SemanticLayerFieldType.TIME &&
        'relativeTime' in filter.values &&
        isSemanticLayerRelativeTimeValue(filter.values.relativeTime)
    );
}

export function isSemanticLayerExactTimeFilter(
    filter: Pick<SemanticLayerFilter, 'fieldType' | 'values'>,
): filter is SemanticLayerExactTimeFilter {
    return (
        filter.fieldType === SemanticLayerFieldType.TIME &&
        'time' in filter.values
    );
}

export function getAvailableSemanticLayerFilterOperators(
    fieldType: SemanticLayerFieldType,
) {
    switch (fieldType) {
        case SemanticLayerFieldType.STRING:
            return [
                SemanticLayerFilterBaseOperator.IS,
                SemanticLayerFilterBaseOperator.IS_NOT,
            ];
        case SemanticLayerFieldType.NUMBER:
        case SemanticLayerFieldType.BOOLEAN:
            return [];
        case SemanticLayerFieldType.TIME:
            return [
                SemanticLayerFilterBaseOperator.IS,
                SemanticLayerFilterBaseOperator.IS_NOT,
            ];
        default:
            return assertUnreachable(
                fieldType,
                `Unsupported field type: ${fieldType}`,
            );
    }
}

export function getFlattenedFilterFieldProps(
    filter: SemanticLayerFilter,
): Pick<SemanticLayerFilter, 'fieldRef' | 'fieldKind' | 'fieldType'>[] {
    const andFiltersFieldNames =
        filter.and?.flatMap(getFlattenedFilterFieldProps) ?? [];
    const orFiltersFieldNames =
        filter.or?.flatMap(getFlattenedFilterFieldProps) ?? [];

    return [
        {
            fieldRef: filter.fieldRef,
            fieldKind: filter.fieldKind,
            fieldType: filter.fieldType,
        },
        ...andFiltersFieldNames,
        ...orFiltersFieldNames,
    ];
}
export type SavedSemanticViewerChart = {
    savedSemanticViewerChartUuid: string;
    name: string;
    description: string | null;
    slug: string;
    config: AllVizChartConfig;
    semanticLayerView: string | null;
    semanticLayerQuery: SemanticLayerQuery;
    chartKind: ChartKind;
    createdAt: Date;
    createdBy: Pick<
        LightdashUser,
        'userUuid' | 'firstName' | 'lastName'
    > | null;
    lastUpdatedAt: Date;
    lastUpdatedBy: Pick<
        LightdashUser,
        'userUuid' | 'firstName' | 'lastName'
    > | null;
    space: Pick<SpaceSummary, 'uuid' | 'name' | 'isPrivate' | 'userAccess'>;
    dashboard: Pick<Dashboard, 'uuid' | 'name'> | null;
    project: Pick<Project, 'projectUuid'>;
    organization: Pick<Organization, 'organizationUuid'>;
    views: number;
    firstViewedAt: Date;
    lastViewedAt: Date;
};

export type SemanticLayerCreateChart = {
    name: string;
    description: string | null;
    semanticLayerView: string | null;
    semanticLayerQuery: SemanticLayerQuery;
    config: VizChartConfig;
    spaceUuid: string;
};

export type ApiSemanticLayerCreateChart = {
    status: 'ok';
    results: {
        savedSemanticViewerChartUuid: string;
        slug: string;
    };
};

export type ApiSemanticLayerGetChart = {
    status: 'ok';
    results: SavedSemanticViewerChart;
};
