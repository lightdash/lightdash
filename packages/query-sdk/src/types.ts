/**
 * Core types for the Lightdash SDK.
 */

// --- Filter types ---

export type UnitOfTime = 'days' | 'weeks' | 'months' | 'quarters' | 'years';

export type FilterValue = string | number | boolean;

export type FilterOperator =
    | 'equals'
    | 'notEquals'
    | 'greaterThan'
    | 'greaterThanOrEqual'
    | 'lessThan'
    | 'lessThanOrEqual'
    | 'isNull'
    | 'notNull'
    | 'startsWith'
    | 'endsWith'
    | 'include'
    | 'doesNotInclude'
    | 'inThePast'
    | 'notInThePast'
    | 'inTheNext'
    | 'inTheCurrent'
    | 'notInTheCurrent'
    | 'inBetween'
    | 'notInBetween';

export type Filter = {
    field: string;
    operator: FilterOperator;
    value?: FilterValue | FilterValue[];
    unit?: UnitOfTime;
};

export type Sort = {
    field: string;
    direction: 'asc' | 'desc';
};

// --- Table calculation types ---

export type TableCalculation = {
    /** Internal name of the table calculation (used as the field ID in results) */
    name: string;
    /** Display name shown in the UI */
    displayName: string;
    /** SQL expression for the calculation */
    sql: string;
};

// --- Additional metric types ---

export type MetricType =
    | 'average'
    | 'count'
    | 'count_distinct'
    | 'sum'
    | 'sum_distinct'
    | 'min'
    | 'max'
    | 'number'
    | 'median'
    | 'percentile';

export type AdditionalMetric = {
    /** Internal name of the metric (used as the field ID in results) */
    name: string;
    /** Display label */
    label?: string;
    /** Table the metric belongs to */
    table: string;
    /** Aggregation type */
    type: MetricType;
    /** SQL expression (e.g., ${TABLE}.column_name) */
    sql: string;
    /** Description of what the metric measures */
    description?: string;
};

// --- Custom dimension types ---

export type CustomDimension = {
    /** Unique ID for the custom dimension */
    id: string;
    /** Internal name */
    name: string;
    /** Table the dimension belongs to */
    table: string;
    /** SQL expression */
    sql: string;
    /** The dimension type */
    dimensionId: string;
};

// --- Internal types (used by transport) ---

export type InternalFilterDefinition = {
    fieldId: string;
    operator: string;
    values: FilterValue[];
    settings: { unitOfTime: UnitOfTime } | null;
};

export type QueryDefinition = {
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    filters: InternalFilterDefinition[];
    sorts: { fieldId: string; descending: boolean }[];
    tableCalculations: TableCalculation[];
    additionalMetrics: AdditionalMetric[];
    customDimensions: CustomDimension[];
    limit: number;
    /** Human-readable label for dev tools / query inspector (not sent to the API) */
    label?: string;
};

// --- Query results ---

export type ColumnType = 'string' | 'number' | 'date' | 'timestamp' | 'boolean';

export type Column = {
    name: string;
    label: string;
    type: ColumnType;
};

export type Row = Record<string, string | number | boolean | null>;

export type FormatFunction = (row: Row, fieldId: string) => string;

export type QueryResult = {
    rows: Row[];
    columns: Column[];
    format: FormatFunction;
};

// --- Client config ---

export type LightdashClientConfig = {
    /** Lightdash instance URL */
    baseUrl: string;
    /** Project UUID */
    projectUuid: string;
    /** API key (PAT or scoped token) */
    apiKey: string;
    /** Use relative /api paths instead of baseUrl (for dev proxy setups) */
    useProxy?: boolean;
};

// --- User ---

export type LightdashUser = {
    name: string;
    email: string;
    role: string;
    orgId: string;
    attributes: Record<string, string>;
};

// --- Transport ---

export type Transport = {
    executeQuery: (query: QueryDefinition) => Promise<QueryResult>;
    getUser: () => Promise<LightdashUser>;
};
