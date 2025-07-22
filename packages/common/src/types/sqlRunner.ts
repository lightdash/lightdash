import {
    type ApiError,
    type Explore,
    type FieldType,
    type PivotChartData,
    type PivotChartLayout,
    type PullRequestCreated,
    type QueryExecutionContext,
} from '..';
import {
    type AllVizChartConfig,
    type PivotIndexColum,
    type SortByDirection,
    type VizAggregationOptions,
    type VizBaseConfig,
    type VizCartesianChartConfig,
    type VizColumn,
    type VizPieChartConfig,
    type VizTableConfig,
} from '../visualizations/types';
import { type Dashboard } from './dashboard';
import { type Organization } from './organization';
import { type Project } from './projects';
import { type RawResultRow } from './results';
import { type ChartKind } from './savedCharts';
import { SchedulerJobStatus, type TraceTaskBase } from './scheduler';
import { type SpaceSummary } from './space';
import { type LightdashUser } from './user';

export enum SqlRunnerFieldType {
    TIME = 'time',
    NUMBER = 'number',
    STRING = 'string',
    BOOLEAN = 'boolean',
}

enum SqlRunnerTimeGranularity {
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

export type SqlRunnerField = {
    name: string;
    label: string;
    type: SqlRunnerFieldType;
    kind: FieldType;
    description?: string;
    visible: boolean;
    aggType?: VizAggregationOptions; // TODO: currently not populated, we should get this on the backend
    availableGranularities: SqlRunnerTimeGranularity[];
    availableOperators: SqlRunnerFilter['operator'][];
};

type SqlRunnerTimeDimension = SqlRunnerField & {
    granularity?: SqlRunnerTimeGranularity;
};

export type SqlRunnerSortBy = Pick<SqlRunnerField, 'name' | 'kind'> & {
    direction: SortByDirection;
};

type SqlRunnerPivot = {
    on: string[];
    index: string[];
    values: string[];
};

export type SqlRunnerQuery = {
    dimensions: Pick<SqlRunnerField, 'name'>[];
    timeDimensions: Pick<SqlRunnerTimeDimension, 'name' | 'granularity'>[];
    metrics: Pick<SqlRunnerField, 'name'>[];
    sortBy: SqlRunnerSortBy[];
    limit?: number;
    timezone?: string;
    pivot?: SqlRunnerPivot;
    filters: SqlRunnerFilter[];
    sql?: string;
    customMetrics?: (Pick<SqlRunnerField, 'name' | 'aggType'> & {
        baseDimension?: string;
    })[];
};

export enum SqlRunnerFilterBaseOperator {
    IS = 'IS',
    IS_NOT = 'IS_NOT',
}

export enum SqlRunnerFilterRelativeTimeValue {
    TODAY = 'TODAY',
    YESTERDAY = 'YESTERDAY',
    LAST_7_DAYS = 'LAST_7_DAYS',
    LAST_30_DAYS = 'LAST_30_DAYS',
}

export type SqlRunnerFilterBase = {
    uuid: string;
    fieldRef: string;
    fieldKind: FieldType; // This is mostly to help with frontend state and avoiding having to set all the fields in redux to be able to find the kind
    fieldType: SqlRunnerFieldType;
};

export type SqlRunnerStringFilter = SqlRunnerFilterBase & {
    fieldType: SqlRunnerFieldType.STRING;
    operator: SqlRunnerFilterBaseOperator;
    values: string[];
};

export type SqlRunnerExactTimeFilter = SqlRunnerFilterBase & {
    fieldType: SqlRunnerFieldType.TIME;
    operator: SqlRunnerFilterBaseOperator;
    values: { time: string };
};

export type SqlRunnerRelativeTimeFilter = SqlRunnerFilterBase & {
    fieldType: SqlRunnerFieldType.TIME;
    operator: SqlRunnerFilterBaseOperator;
    values: { relativeTime: SqlRunnerFilterRelativeTimeValue };
};

export type SqlRunnerTimeFilter =
    | SqlRunnerExactTimeFilter
    | SqlRunnerRelativeTimeFilter;

type SqlRunnerFilterTypes = SqlRunnerStringFilter | SqlRunnerTimeFilter;

export type SqlRunnerFilter = SqlRunnerFilterTypes & {
    and?: SqlRunnerFilter[];
    or?: SqlRunnerFilter[];
};

export type SqlRunnerPayload = TraceTaskBase & {
    sqlChartUuid?: string;
    context: QueryExecutionContext;
} & SqlRunnerBody;

export type ValuesColumn = {
    reference: string;
    aggregation: VizAggregationOptions;
};

export type GroupByColumn = {
    reference: string;
};

export type SortBy = PivotChartLayout['sortBy'];

type ApiSqlRunnerPivotQueryPayload = {
    savedSqlUuid?: string;
    indexColumn: PivotIndexColum;
    valuesColumns: ValuesColumn[];
    groupByColumns: GroupByColumn[] | undefined;
    sortBy: PivotChartLayout['sortBy'] | undefined;
};

export type SqlRunnerPivotQueryPayload = SqlRunnerPayload &
    ApiSqlRunnerPivotQueryPayload;

export type SqlRunnerBody = {
    sql: string;
    limit?: number;
};

export type SqlRunnerPivotQueryBody = SqlRunnerBody &
    ApiSqlRunnerPivotQueryPayload;

export type SqlRunnerResults = RawResultRow[];

type SqlRunnerJobStatusSuccessDetails = {
    fileUrl: string;
    columns: VizColumn[];
};

type SqlRunnerPivotQueryJobStatusSuccessDetails =
    SqlRunnerJobStatusSuccessDetails & Omit<PivotChartData, 'results'>;

type SqlRunnerJobStatusErrorDetails = {
    error: string;
    charNumber?: number;
    lineNumber?: number;
    createdByUserUuid: string;
};

export function isErrorDetails(
    results?: ApiSqlRunnerJobStatusResponse['results']['details'],
): results is SqlRunnerJobStatusErrorDetails {
    return (results as SqlRunnerJobStatusErrorDetails).error !== undefined;
}

export type ApiSqlRunnerJobStatusResponse = {
    status: 'ok';
    results: {
        status: SchedulerJobStatus;
        details:
            | SqlRunnerJobStatusSuccessDetails
            | SqlRunnerJobStatusErrorDetails;
    };
};

export type ApiSqlRunnerJobSuccessResponse = ApiSqlRunnerJobStatusResponse & {
    results: {
        status: SchedulerJobStatus.COMPLETED;
        details: SqlRunnerJobStatusSuccessDetails;
    };
};

export const isApiSqlRunnerJobSuccessResponse = (
    response: ApiSqlRunnerJobStatusResponse['results'] | ApiError,
): response is ApiSqlRunnerJobSuccessResponse['results'] =>
    response.status === SchedulerJobStatus.COMPLETED;

export const isApiSqlRunnerJobErrorResponse = (
    response: ApiSqlRunnerJobStatusResponse['results'] | ApiError,
): response is ApiError => response.status === SchedulerJobStatus.ERROR;

export type ApiSqlRunnerJobPivotQuerySuccessResponse = {
    results: {
        status: SchedulerJobStatus.COMPLETED;
        details: SqlRunnerPivotQueryJobStatusSuccessDetails;
    };
};

export const isApiSqlRunnerJobPivotQuerySuccessResponse = (
    response: ApiSqlRunnerJobStatusResponse['results'] | ApiError,
): response is ApiSqlRunnerJobPivotQuerySuccessResponse['results'] =>
    response.status === SchedulerJobStatus.COMPLETED;

export type SqlChart = {
    savedSqlUuid: string;
    name: string;
    description: string | null;
    slug: string;
    sql: string;
    limit: number;
    config: VizBaseConfig &
        (VizCartesianChartConfig | VizPieChartConfig | VizTableConfig);
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

export type CreateSqlChart = {
    name: string;
    description: string | null;
    sql: string;
    limit: number;
    config: AllVizChartConfig;
    spaceUuid: string;
};

export type UpdateUnversionedSqlChart = {
    name: string;
    description: string | null;
    spaceUuid: string;
};

export type UpdateVersionedSqlChart = {
    sql: string;
    limit: number;
    config: AllVizChartConfig;
};

export type UpdateSqlChart = {
    unversionedData?: UpdateUnversionedSqlChart;
    versionedData?: UpdateVersionedSqlChart;
};

export type ApiSqlChart = {
    status: 'ok';
    results: SqlChart;
};

export type ApiCreateSqlChart = {
    status: 'ok';
    results: {
        savedSqlUuid: string;
        slug: string;
    };
};

export type ApiUpdateSqlChart = {
    status: 'ok';
    results: {
        savedSqlUuid: string;
        savedSqlVersionUuid: string | null;
    };
};

export type ApiCreateVirtualView = {
    status: 'ok';
    results: Pick<Explore, 'name'>;
};

export type CreateVirtualViewPayload = {
    name: string;
    sql: string;
    columns: VizColumn[];
};

export type UpdateVirtualViewPayload = CreateVirtualViewPayload;

export type ApiGithubDbtWriteBack = {
    status: 'ok';
    results: PullRequestCreated;
};

export type ApiGithubDbtWritePreview = {
    status: 'ok';
    results: {
        url: string;
        repo: string;
        path: string;
        files: string[];
        owner: string;
    };
};
