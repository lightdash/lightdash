import {
    type CartesianChartDisplay,
    type PieChartDisplay,
    type SqlColumn,
    type SqlTransformCartesianChartConfig,
    type SqlTransformPieChartConfig,
} from '../visualizations/SqlRunnerResultsTransformer';
import { type Dashboard } from './dashboard';
import { type Organization } from './organization';
import { type Project } from './projects';
import { type ResultRow } from './results';
import { ChartKind } from './savedCharts';
import {
    type ApiJobScheduledResponse,
    type SchedulerJobStatus,
} from './scheduler';
import { type SpaceSummary } from './space';
import { type LightdashUser } from './user';

export type SqlRunnerPayload = {
    projectUuid: string;
    sql: string;
    userUuid: string;
    organizationUuid: string | undefined;
    sqlChartUuid?: string;
    context: 'sqlChartView' | 'sqlRunner' | 'dashboardView'; // TODO: move scheduler types to Backend package. Can't import QueryExecutionProperties from LightdashAnalytics
};

export type SqlRunnerBody = {
    sql: string;
};

export type SqlRunnerResults = ResultRow[];

export const sqlRunnerJob = 'sqlRunner';

type SqlRunnerJobStatusSuccessDetails = {
    fileUrl: string;
    columns: SqlColumn[];
};

type SqlRunnerJobStatusErrorDetails = {
    error: string;
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

export type SqlRunnerChartConfig = {
    metadata: {
        version: number;
    };
    type: ChartKind;
};

export type SqlTableConfig = {
    columns: {
        [key: string]: {
            visible: boolean;
            reference: string;
            label: string;
            frozen: boolean;
            order?: number;
        };
    };
};

export type TableChartSqlConfig = SqlRunnerChartConfig &
    SqlTableConfig & {
        type: ChartKind.TABLE;
    };

export type CartesianChartSqlConfig = SqlRunnerChartConfig & {
    type: ChartKind.VERTICAL_BAR | ChartKind.LINE;
    fieldConfig: SqlTransformCartesianChartConfig | undefined;
    display: CartesianChartDisplay | undefined;
};

export type BarChartSqlConfig = SqlRunnerChartConfig & {
    type: ChartKind.VERTICAL_BAR;
    fieldConfig: SqlTransformCartesianChartConfig | undefined;
    display: CartesianChartDisplay | undefined;
};

export type LineChartSqlConfig = SqlRunnerChartConfig & {
    type: ChartKind.LINE;
    fieldConfig: SqlTransformCartesianChartConfig | undefined;
    display: CartesianChartDisplay | undefined;
};

export type PieChartSqlConfig = SqlRunnerChartConfig & {
    type: ChartKind.PIE;
    fieldConfig: SqlTransformPieChartConfig | undefined;
    display: PieChartDisplay | undefined;
};

export const isTableChartSQLConfig = (
    value: SqlRunnerChartConfig | undefined,
): value is TableChartSqlConfig => !!value && value.type === ChartKind.TABLE;

export const isBarChartSQLConfig = (
    value: SqlRunnerChartConfig | undefined,
): value is BarChartSqlConfig =>
    !!value && value.type === ChartKind.VERTICAL_BAR;

export const isLineChartSQLConfig = (
    value: SqlRunnerChartConfig | undefined,
): value is LineChartSqlConfig => !!value && value.type === ChartKind.LINE;

export const isCartesianChartSQLConfig = (
    value: SqlRunnerChartConfig | undefined,
): value is CartesianChartSqlConfig =>
    !!value &&
    (value.type === ChartKind.LINE || value.type === ChartKind.VERTICAL_BAR);

export const isPieChartSQLConfig = (
    value: SqlRunnerChartConfig | undefined,
): value is PieChartSqlConfig => !!value && value.type === ChartKind.PIE;

export type SqlChart = {
    savedSqlUuid: string;
    name: string;
    description: string | null;
    slug: string;
    sql: string;
    config: SqlRunnerChartConfig;
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
};

export type CreateSqlChart = {
    name: string;
    description: string | null;
    sql: string;
    config: SqlRunnerChartConfig;
    spaceUuid: string;
};

export type UpdateUnversionedSqlChart = {
    name: string;
    description: string | null;
    spaceUuid: string;
};

export type UpdateVersionedSqlChart = {
    sql: string;
    config: SqlRunnerChartConfig;
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

export type ApiSqlChartWithResults = {
    status: 'ok';
    results: {
        jobId: ApiJobScheduledResponse['results']['jobId'];
        chart: SqlChart;
    };
};
