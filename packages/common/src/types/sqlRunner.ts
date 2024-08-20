import { type ApiError } from '..';
import { type CartesianChartDisplay } from '../visualizations/CartesianChartDataTransformer';
import {
    type VizPieChartDisplay,
    type VizSqlCartesianChartLayout,
    type VizSqlColumn,
} from '../visualizations/types';
import { type Dashboard } from './dashboard';
import { type Organization } from './organization';
import { type Project } from './projects';
import { type ResultRow } from './results';
import { ChartKind } from './savedCharts';
import { SchedulerJobStatus, type ApiJobScheduledResponse } from './scheduler';
import { type SpaceSummary } from './space';
import { type LightdashUser } from './user';

export type SqlRunnerPayload = {
    projectUuid: string;
    sql: string;
    limit?: number;
    userUuid: string;
    organizationUuid: string | undefined;
    sqlChartUuid?: string;
    context: 'sqlChartView' | 'sqlRunner' | 'dashboardView'; // TODO: move scheduler types to Backend package. Can't import QueryExecutionProperties from LightdashAnalytics
};

export type SqlRunnerBody = {
    sql: string;
    limit?: number;
};

export type SqlRunnerResults = ResultRow[];

export const sqlRunnerJob = 'sqlRunner';

type SqlRunnerJobStatusSuccessDetails = {
    fileUrl: string;
    columns: VizSqlColumn[];
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
    fieldConfig: VizSqlCartesianChartLayout | undefined;
    display: CartesianChartDisplay | undefined;
};

export type BarChartSqlConfig = SqlRunnerChartConfig & {
    type: ChartKind.VERTICAL_BAR;
    fieldConfig: VizSqlCartesianChartLayout | undefined;
    display: CartesianChartDisplay | undefined;
};

export type LineChartSqlConfig = SqlRunnerChartConfig & {
    type: ChartKind.LINE;
    fieldConfig: VizSqlCartesianChartLayout | undefined; // PR NOTE: types are identical
    display: CartesianChartDisplay | undefined;
};

export type PieChartSqlConfig = SqlRunnerChartConfig & {
    type: ChartKind.PIE;
    fieldConfig: VizSqlCartesianChartLayout | undefined; // PR NOTE: this will break serialization to the database (types are different)
    display: VizPieChartDisplay | undefined;
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
    limit: number;
    config: SqlRunnerChartConfig &
        (CartesianChartSqlConfig | PieChartSqlConfig | TableChartSqlConfig);
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
    limit: number;
    config: SqlRunnerChartConfig &
        (CartesianChartSqlConfig | PieChartSqlConfig | TableChartSqlConfig);
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
    config: SqlRunnerChartConfig &
        (CartesianChartSqlConfig | PieChartSqlConfig | TableChartSqlConfig);
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
