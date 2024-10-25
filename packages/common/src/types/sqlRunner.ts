import {
    type ApiError,
    type Explore,
    type PivotChartData,
    type PivotChartLayout,
    type PullRequestCreated,
    type QueryExecutionContext,
} from '..';
import {
    type AllVizChartConfig,
    type PivotIndexColum,
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
import { SchedulerJobStatus } from './scheduler';
import { type SpaceSummary } from './space';
import { type LightdashUser } from './user';

export type SqlRunnerPayload = {
    projectUuid: string;
    userUuid: string;
    organizationUuid: string | undefined;
    sqlChartUuid?: string;
    context: QueryExecutionContext;
} & SqlRunnerBody;

type ApiSqlRunnerPivotQueryPayload = {
    savedSqlUuid?: string;
    indexColumn: PivotIndexColum;
    valuesColumns: {
        reference: string;
        aggregation: VizAggregationOptions;
    }[];
    groupByColumns: { reference: string }[] | undefined;
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

export const sqlRunnerJob = 'sqlRunner';
export const sqlRunnerPivotQueryJob = 'sqlRunnerPivotQuery';

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

// TODO: common type with semantic viewer and should be abstracted
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
