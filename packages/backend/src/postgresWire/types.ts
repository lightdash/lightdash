import { type MetricQuery } from '@lightdash/common';

export type PgWireFieldKind = 'dimension' | 'metric';

export type PgWireField = {
    /** Lightdash field id, exposed to clients as the column name (e.g. `orders_status`) */
    fieldId: string;
    kind: PgWireFieldKind;
    /** DimensionType or MetricType value, used to pick a Postgres type OID */
    type: string;
};

/** One explore exposed as a Postgres table */
export type PgWireTable = {
    name: string;
    fields: PgWireField[];
};

export type PgWireColumnKind = PgWireFieldKind | 'table_calculation';

/** One output column of the compiled query, in SELECT order */
export type PgWireColumn = {
    /** Column name presented to the client (alias if given) */
    name: string;
    /** Key into result rows: a fieldId or a table calculation name */
    source: string;
    kind: PgWireColumnKind;
    /** DimensionType/MetricType value for OID mapping; null when unknown */
    type: string | null;
};

export type PgWireCompiledQuery = {
    table: PgWireTable;
    metricQuery: MetricQuery;
    columns: PgWireColumn[];
};
