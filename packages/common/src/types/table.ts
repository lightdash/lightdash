import { type InlineError } from './explore';
import { type ModelRequiredFilterRule } from './filter';
import type { DefaultTimeDimension } from './timeFrames';

export enum OrderFieldsByStrategy {
    LABEL = 'LABEL',
    INDEX = 'INDEX',
}

export type GroupType = {
    label: string;
    description?: string;
};

export type FieldGroupType = {
    label: string;
    description?: string;
    aiHint?: string | string[];
};

/**
 * Where a virtual table comes from and how its element is addressed in SQL.
 * `elementSql` is what `${TABLE}` resolves to for its fields: the alias itself
 * where the unnest yields the element (BigQuery), `alias.col` where it yields
 * a row around it (Databricks).
 */
export type NestedTableProvenance = {
    parentTable: string;
    columnPath: string;
    elementSql: string;
    offsetSql: string;
    /** Null when the warehouse plans the lateral join without a condition. */
    joinCondition: string | null;
};

export type TableBase = {
    name: string; // Must be sql friendly (a-Z, 0-9, _)
    label: string; // Friendly name
    originalName?: string; // Original name from dbt, without alias
    canonicalName?: string; // Qualified table name before applying a join alias
    description?: string; // Optional description of table
    /*
        @deprecated

        TODO: database and schema can be deleted
     */
    database: string;
    /*
        @deprecated
     */
    schema: string;
    sqlTable: string; // The sql identifier for the table
    /** Set on tables unnested from a repeated column of `parentTable`; their grain is derived, so they carry no primary key. */
    nestedFrom?: NestedTableProvenance;
    primaryKey?: string[];
    orderFieldsBy?: OrderFieldsByStrategy;
    groupLabel?: string;
    sqlWhere?: string;
    requiredFilters?: ModelRequiredFilterRule[];
    hidden?: boolean;
    requiredAttributes?: Record<string, string | string[]>;
    anyAttributes?: Record<string, string | string[]>;
    groupDetails?: Record<string, FieldGroupType>;
    defaultTimeDimension?: DefaultTimeDimension;
    defaultShowUnderlyingValues?: string[];
    aiHint?: string | string[];
    warnings?: InlineError[];
    dbtPackageName?: string;
    dbtSourceUuid?: string;
    ymlPath?: string;
    sqlPath?: string;
};
