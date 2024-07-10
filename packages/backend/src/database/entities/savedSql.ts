import {
    BinRange,
    ChartConfig,
    ChartKind,
    ChartType,
    CompactOrAlias,
    CustomFormat,
    DBFieldTypes,
    DimensionType,
    MetricFilterRule,
    MetricType,
    NumberSeparator,
    TableCalculationType,
    TimeZone,
} from '@lightdash/common';
import { Knex } from 'knex';

export const SavedSqlTableName = 'saved_sql';
export const SavedSqlVersionsTableName = 'saved_sql_versions';

export type DbSavedSql = {
    saved_sql_uuid: string;
    space_uuid: string | null;
    dashboard_uuid: string | null;
    name: string;
    created_at: Date;
    created_by_user_uuid: string | null;
    description: string | null;
    last_version_chart_kind: ChartKind;
    last_version_updated_at: Date;
    last_version_updated_by_user_uuid: string | undefined;
    search_vector: string;
    slug: string;
    views_count: number;
    first_viewed_at: Date | null;
};

type InsertSqlInSpace = Pick<
    DbSavedSql,
    'name' | 'description' | 'created_by_user_uuid' | 'slug'
> & {
    space_uuid: string;
    dashboard_uuid: null;
};

type InsertSqlInDashboard = Pick<
    DbSavedSql,
    | 'name'
    | 'description'
    | 'last_version_chart_kind'
    | 'last_version_updated_by_user_uuid'
> & {
    space_uuid: null;
    dashboard_uuid: string;
};

export type InsertSql = InsertSqlInSpace | InsertSqlInDashboard;

type UpdateSql = Partial<
    Pick<
        DbSavedSql,
        | 'name'
        | 'description'
        | 'last_version_chart_kind'
        | 'last_version_updated_at'
        | 'last_version_updated_by_user_uuid'
        | 'space_uuid'
        | 'dashboard_uuid'
        | 'slug'
        | 'views_count'
        | 'first_viewed_at'
    >
>;

export type SavedSqlTable = Knex.CompositeTableType<
    DbSavedSql,
    InsertSql,
    UpdateSql
>;

export type DbSavedSqlVersion = {
    saved_sql_version_uuid: string;
    saved_sql_uuid: string;
    created_at: Date;
    sql: string;
    config: object;
    chart_kind: ChartKind;
    created_by_user_uuid: string;
};

export type InsertSavedSqlVersion = Pick<
    DbSavedSqlVersion,
    'saved_sql_uuid' | 'sql' | 'config' | 'chart_kind' | 'created_by_user_uuid'
>;

export type SavedSqlVersionsTable = Knex.CompositeTableType<
    DbSavedSqlVersion,
    InsertSavedSqlVersion,
    never
>;
