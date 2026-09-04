import {
    type MetricQuery,
    type SupportedDbtAdapter,
    type TimeFrames,
} from '@lightdash/common';

export type PgWireFieldKind = 'dimension' | 'metric';

/** A dimension generated from a date/timestamp dimension at a fixed time frame (e.g. `order_date_year`) */
export type PgWireTimeInterval = {
    frame: TimeFrames;
    /** name of the date/timestamp dimension the interval was derived from, within the same table */
    baseDimensionName: string;
};

export type PgWireField = {
    /** Lightdash field id, exposed to clients as the column name (e.g. `orders_status`) */
    fieldId: string;
    /** explore table the field belongs to (base or joined), for ${table.name} metric refs */
    table: string;
    /** field name within its table */
    name: string;
    kind: PgWireFieldKind;
    /** DimensionType or MetricType value, used to pick a Postgres type OID */
    type: string;
    /** Shown as the column comment by schema browsers */
    description: string | null;
    timeInterval: PgWireTimeInterval | null;
};

/** One explore exposed as a Postgres table */
export type PgWireTable = {
    name: string;
    fields: PgWireField[];
    /** Shown as the table comment by schema browsers */
    description: string | null;
    /** warehouse dialect the explore compiles to; used for synthesised time-frame SQL */
    targetDatabase: SupportedDbtAdapter;
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
    /** WHERE 1=0 or LIMIT 0: return the column shape without querying the warehouse */
    alwaysEmpty: boolean;
};
