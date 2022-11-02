import { FilterRule } from './filter';
import { TimeFrames } from './timeFrames';

export enum NumberStyle {
    THOUSANDS = 'thousands',
    MILLIONS = 'millions',
    BILLIONS = 'billions',
    TRILLIONS = 'trillions',
}

const NumberStyleAlias = [
    'K',
    'thousand',
    'M',
    'million',
    'B',
    'billion',
    'T',
    'trillion',
] as const;

type NumberStyleConfig = {
    numberStyle: NumberStyle;
    alias: Array<typeof NumberStyleAlias[number]>;
    convertFn: (value: number) => number;
    label: string;
    suffix: string;
};

export type NumberStyleOrAlias = NumberStyle | typeof NumberStyleAlias[number];

export const NumberStyleConfigMap: Record<NumberStyle, NumberStyleConfig> = {
    [NumberStyle.THOUSANDS]: {
        numberStyle: NumberStyle.THOUSANDS,
        alias: ['K', 'thousand'],
        convertFn: (value: number) => value / 1000,
        label: 'thousands (K)',
        suffix: 'K',
    },
    [NumberStyle.MILLIONS]: {
        numberStyle: NumberStyle.MILLIONS,
        alias: ['M', 'million'],
        convertFn: (value: number) => value / 1000000,
        label: 'millions (M)',
        suffix: 'M',
    },
    [NumberStyle.BILLIONS]: {
        numberStyle: NumberStyle.BILLIONS,
        alias: ['B', 'billion'],
        convertFn: (value: number) => value / 1000000000,
        label: 'billions (B)',
        suffix: 'B',
    },
    [NumberStyle.TRILLIONS]: {
        numberStyle: NumberStyle.TRILLIONS,
        alias: ['T', 'trillion'],
        convertFn: (value: number) => value / 1000000000000,
        label: 'trillions (T)',
        suffix: 'T',
    },
};

export function findNumberStyleConfig(
    numberStyleOrAlias: NumberStyleOrAlias,
): NumberStyleConfig | undefined {
    return Object.values(NumberStyleConfigMap).find(
        ({ numberStyle, alias }) =>
            numberStyle === numberStyleOrAlias ||
            alias.includes(numberStyleOrAlias as any),
    );
}

export enum FieldType {
    METRIC = 'metric',
    DIMENSION = 'dimension',
}

export type FieldUrl = {
    url: string;
    label: string;
};

// Every dimension and metric is a field
export interface Field {
    fieldType: FieldType;
    type: string; // Discriminator field
    name: string; // Field names are unique within a table
    label: string; // Friendly name
    table: string; // Table names are unique within the project
    tableLabel: string; // Table friendly name
    sql: string; // Templated sql
    description?: string;
    source?: Source | undefined;
    hidden: boolean;
    compact?: NumberStyleOrAlias;
    round?: number;
    format?: string;
    groupLabel?: string;
    urls?: FieldUrl[];
}

export const isField = (field: any): field is Field =>
    field ? !!field.fieldType : false;

// Field ids are unique across the project
export type FieldId = string;
export const fieldId = (field: Pick<Field, 'table' | 'name'>): FieldId =>
    `${field.table}_${field.name}`;

export type Source = {
    path: string;
    range: {
        start: SourcePosition;
        end: SourcePosition;
    };
    highlight?: {
        start: SourcePosition;
        end: SourcePosition;
    };
    content: string;
};
type SourcePosition = {
    line: number;
    character: number;
};

export enum DimensionType {
    STRING = 'string',
    NUMBER = 'number',
    TIMESTAMP = 'timestamp',
    DATE = 'date',
    BOOLEAN = 'boolean',
}

export interface Dimension extends Field {
    fieldType: FieldType.DIMENSION;
    type: DimensionType;
    group?: string;
    timeInterval?: TimeFrames;
}

export interface CompiledDimension extends Dimension {
    compiledSql: string; // sql string with resolved template variables
    tablesReferences: Array<string> | undefined;
}

export type CompiledField = CompiledDimension | CompiledMetric;
export const isDimension = (field: any): field is Dimension =>
    isField(field) && field.fieldType === FieldType.DIMENSION;

export interface CompiledMetric extends Metric {
    compiledSql: string;
    tablesReferences: Array<string> | undefined;
}

export interface FilterableDimension extends Dimension {
    type:
        | DimensionType.STRING
        | DimensionType.NUMBER
        | DimensionType.DATE
        | DimensionType.TIMESTAMP
        | DimensionType.BOOLEAN;
}

export const isFilterableDimension = (
    dimension: Dimension,
): dimension is FilterableDimension =>
    [
        DimensionType.STRING,
        DimensionType.NUMBER,
        DimensionType.DATE,
        DimensionType.TIMESTAMP,
        DimensionType.BOOLEAN,
    ].includes(dimension.type);
export type FilterableField = FilterableDimension | Metric;
export const isFilterableField = (
    field: Field | Dimension | Metric,
): field is FilterableField =>
    isDimension(field) ? isFilterableDimension(field) : true;

export type FieldRef = string;
export const getFieldRef = (field: Field): FieldRef =>
    `${field.table}.${field.name}`;

export const getFieldLabel = (field: Field): string =>
    `${field.tableLabel} ${field.label}`;

export enum MetricType {
    AVERAGE = 'average',
    COUNT = 'count',
    COUNT_DISTINCT = 'count_distinct',
    SUM = 'sum',
    MIN = 'min',
    MAX = 'max',
    NUMBER = 'number',
    STRING = 'string',
    DATE = 'date',
    BOOLEAN = 'boolean',
}

export const parseMetricType = (metricType: string): MetricType => {
    switch (metricType) {
        case 'average':
            return MetricType.AVERAGE;
        case 'count':
            return MetricType.COUNT;
        case 'count_distinct':
            return MetricType.COUNT_DISTINCT;
        case 'sum':
            return MetricType.SUM;
        case 'min':
            return MetricType.MIN;
        case 'max':
            return MetricType.MAX;
        case 'number':
            return MetricType.NUMBER;
        case 'string':
            return MetricType.STRING;
        case 'date':
            return MetricType.DATE;
        case 'boolean':
            return MetricType.BOOLEAN;
        default:
            throw new Error(
                `Cannot parse dbt metric with type '${metricType}'`,
            );
    }
};

const NonAggregateMetricTypes = [
    MetricType.STRING,
    MetricType.NUMBER,
    MetricType.DATE,
    MetricType.BOOLEAN,
];

export const isMetric = (field: Field | undefined): field is Metric =>
    field ? field.fieldType === FieldType.METRIC : false;

export const isNonAggregateMetric = (field: Field): boolean =>
    isMetric(field) && NonAggregateMetricTypes.includes(field.type);

export interface Metric extends Field {
    fieldType: FieldType.METRIC;
    type: MetricType;
    isAutoGenerated: boolean;
    showUnderlyingValues?: string[];
    filters?: FilterRule[];
}

export const defaultSql = (columnName: string): string =>
    // eslint-disable-next-line no-useless-escape
    `\$\{TABLE\}.${columnName}`;
const capitalize = (word: string): string =>
    word ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}` : '';
export const friendlyName = (text: string): string => {
    if (text === '') {
        return '';
    }
    const normalisedText =
        text === text.toUpperCase() ? text.toLowerCase() : text; // force all uppercase to all lowercase
    const [first, ...rest] =
        normalisedText.match(/[0-9]*[A-Za-z][a-z]*|[0-9]+/g) || [];
    return [
        capitalize(first.toLowerCase()),
        ...rest.map((word) => word.toLowerCase()),
    ].join(' ');
};
