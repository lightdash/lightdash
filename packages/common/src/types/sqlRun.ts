import { SupportedDbtAdapter } from './dbt';
import { DimensionType } from './field';

export type Column = {
    name: string;
    dimensionType: DimensionType;
};

export type SqlRunResultsPreview = {
    columns: Column[];
    rows: Record<string, unknown>[];
};

export type SqlRun = {
    sqlRunUuid: string;
    sql: string;
    projectUuid: string;
    createdByOrganizationUuid?: string;
    createdByUserUuid?: string;
    resultsPreview: SqlRunResultsPreview;
    createdAt: Date;
    targetDatabase: SupportedDbtAdapter;
};

export type CreateSqlRun = Pick<
    SqlRun,
    | 'sql'
    | 'projectUuid'
    | 'createdByOrganizationUuid'
    | 'createdByUserUuid'
    | 'resultsPreview'
    | 'targetDatabase'
>;
