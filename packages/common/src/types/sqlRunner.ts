import { type Dashboard } from './dashboard';
import { type Organization } from './organization';
import { type Project } from './projects';
import { type ResultRow } from './results';
import { ChartKind } from './savedCharts';
import { type Space } from './space';
import { type LightdashUser } from './user';

export type SqlRunnerPayload = {
    projectUuid: string;
    sql: string;
    userUuid: string;
    organizationUuid: string | undefined;
};

export type SqlRunnerBody = {
    sql: string;
};

export type SqlRunnerResults = ResultRow[];

export const sqlRunnerJob = 'sqlRunner';

export type SqlTableConfig = {
    columns: Record<
        string,
        {
            visible: boolean;
            reference: string;
            label: string;
            frozen: boolean;
            order?: number;
        }
    >;
};

export type TableChartSqlConfig = SqlTableConfig & {
    metadata: {
        version: number;
    };
    type: ChartKind.TABLE;
};

export type BarChartConfig = {
    metadata: {
        version: number;
    };
    type: ChartKind.VERTICAL_BAR;
    style?: {
        legend:
            | {
                  position: 'top' | 'bottom' | 'left' | 'right';
                  align: 'start' | 'center' | 'end';
              }
            | undefined;
    };
    axes?: {
        x: {
            reference: string;
            label?: string;
        };
        y: {
            reference: string;
            position?: 'left' | 'right';
            label: string;
        }[];
    };
    series?: {
        reference: string;
        yIndex: number;
        name: string;
    }[];
};

export type SqlRunnerChartConfig = TableChartSqlConfig | BarChartConfig;

export const isTableChartSQLConfig = (
    value: SqlRunnerChartConfig | undefined,
): value is TableChartSqlConfig => !!value && value.type === ChartKind.TABLE;

export const isBarChartSQLConfig = (
    value: SqlRunnerChartConfig | undefined,
): value is BarChartConfig => !!value && value.type === ChartKind.VERTICAL_BAR;

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
    space: Pick<Space, 'uuid' | 'name'>;
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
