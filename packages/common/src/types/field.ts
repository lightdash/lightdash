import type {
    AdditionalMetric,
    currencies,
    DefaultTimeDimension,
    LightdashProjectConfig,
} from '..';
import { type AnyType } from './any';
import { CompileError } from './errors';
import { type MetricFilterRule } from './filter';
import { type TimeFrames } from './timeFrames';

export enum Compact {
    THOUSANDS = 'thousands',
    MILLIONS = 'millions',
    BILLIONS = 'billions',
    TRILLIONS = 'trillions',
    KILOBYTES = 'kilobytes',
    MEGABYTES = 'megabytes',
    GIGABYTES = 'gigabytes',
    TERABYTES = 'terabytes',
    PETABYTES = 'petabytes',
    KIBIBYTES = 'kibibytes',
    MEBIBYTES = 'mebibytes',
    GIBIBYTES = 'gibibytes',
    TEBIBYTES = 'tebibytes',
    PEBIBYTES = 'pebibytes',
}

const CompactAlias = [
    'K',
    'thousand',
    'M',
    'million',
    'B',
    'billion',
    'T',
    'trillion',
    'KB',
    'kilobyte',
    'MB',
    'megabyte',
    'GB',
    'gigabyte',
    'TB',
    'terabyte',
    'PB',
    'petabyte',
    'KiB',
    'kibibyte',
    'MiB',
    'mebibyte',
    'GiB',
    'gibibyte',
    'TiB',
    'tebibyte',
    'PiB',
    'pebibyte',
] as const;

export enum NumberSeparator {
    DEFAULT = 'default', // Default separator
    COMMA_PERIOD = 'commaPeriod', // 100,000.00
    SPACE_PERIOD = 'spacePeriod', // 100 000.00
    PERIOD_COMMA = 'periodComma', // 100.000,00
    NO_SEPARATOR_PERIOD = 'noSeparatorPeriod', // 100000.00
}
type CompactConfig = {
    compact: Compact;
    alias: Array<typeof CompactAlias[number]>;
    orderOfMagnitude: number;
    convertFn: (value: number) => number;
    label: string;
    suffix: string;
};

export type CompactOrAlias = Compact | typeof CompactAlias[number];

export const CompactConfigMap: Record<Compact, CompactConfig> = {
    [Compact.THOUSANDS]: {
        compact: Compact.THOUSANDS,
        alias: ['K', 'thousand'],
        orderOfMagnitude: 3,
        convertFn: (value: number) => value / 1000,
        label: 'thousands (K)',
        suffix: 'K',
    },
    [Compact.MILLIONS]: {
        compact: Compact.MILLIONS,
        alias: ['M', 'million'],
        orderOfMagnitude: 6,
        convertFn: (value: number) => value / 1000000,
        label: 'millions (M)',
        suffix: 'M',
    },
    [Compact.BILLIONS]: {
        compact: Compact.BILLIONS,
        alias: ['B', 'billion'],
        orderOfMagnitude: 9,
        convertFn: (value: number) => value / 1000000000,
        label: 'billions (B)',
        suffix: 'B',
    },
    [Compact.TRILLIONS]: {
        compact: Compact.TRILLIONS,
        alias: ['T', 'trillion'],
        orderOfMagnitude: 12,
        convertFn: (value: number) => value / 1000000000000,
        label: 'trillions (T)',
        suffix: 'T',
    },
    [Compact.KILOBYTES]: {
        compact: Compact.KILOBYTES,
        alias: ['KB', 'kilobyte'],
        orderOfMagnitude: 3,
        convertFn: (value: number) => value / 1000,
        label: 'kilobytes (KB)',
        suffix: 'KB',
    },
    [Compact.MEGABYTES]: {
        compact: Compact.MEGABYTES,
        alias: ['MB', 'megabyte'],
        orderOfMagnitude: 6,
        convertFn: (value: number) => value / 1000000,
        label: 'megabytes (MB)',
        suffix: 'MB',
    },
    [Compact.GIGABYTES]: {
        compact: Compact.GIGABYTES,
        alias: ['GB', 'gigabyte'],
        orderOfMagnitude: 9,
        convertFn: (value: number) => value / 1000000000,
        label: 'gigabytes (GB)',
        suffix: 'GB',
    },
    [Compact.TERABYTES]: {
        compact: Compact.TERABYTES,
        alias: ['TB', 'terabyte'],
        orderOfMagnitude: 12,
        convertFn: (value: number) => value / 1000000000000,
        label: 'terabytes (TB)',
        suffix: 'TB',
    },
    [Compact.PETABYTES]: {
        compact: Compact.PETABYTES,
        alias: ['PB', 'petabyte'],
        orderOfMagnitude: 15,
        convertFn: (value: number) => value / 1000000000000000,
        label: 'petabytes (PB)',
        suffix: 'PB',
    },
    [Compact.KIBIBYTES]: {
        compact: Compact.KIBIBYTES,
        alias: ['KiB', 'kibibyte'],
        orderOfMagnitude: -1,
        convertFn: (value: number) => value / 1024,
        label: 'kibibytes (KiB)',
        suffix: 'KiB',
    },
    [Compact.MEBIBYTES]: {
        compact: Compact.MEBIBYTES,
        alias: ['MiB', 'mebibyte'],
        orderOfMagnitude: -1,
        convertFn: (value: number) => value / 1048576,
        label: 'mebibytes (MiB)',
        suffix: 'MiB',
    },
    [Compact.GIBIBYTES]: {
        compact: Compact.GIBIBYTES,
        alias: ['GiB', 'gibibyte'],
        orderOfMagnitude: -1,
        convertFn: (value: number) => value / 1073741824,
        label: 'gibibytes (GiB)',
        suffix: 'GiB',
    },
    [Compact.TEBIBYTES]: {
        compact: Compact.TEBIBYTES,
        alias: ['TiB', 'tebibyte'],
        orderOfMagnitude: -1,
        convertFn: (value: number) => value / 1099511627776,
        label: 'tebibytes (TiB)',
        suffix: 'TiB',
    },
    [Compact.PEBIBYTES]: {
        compact: Compact.PEBIBYTES,
        alias: ['PiB', 'pebibyte'],
        orderOfMagnitude: -1,
        convertFn: (value: number) => value / 1125899906842624,
        label: 'pebibytes (PiB)',
        suffix: 'PiB',
    },
};

export function findCompactConfig(
    compactOrAlias: CompactOrAlias,
): CompactConfig | undefined {
    return Object.values(CompactConfigMap).find(
        ({ compact, alias }) =>
            compact === compactOrAlias ||
            alias.includes(compactOrAlias as AnyType),
    );
}

export enum BinType {
    FIXED_NUMBER = 'fixed_number',
    FIXED_WIDTH = 'fixed_width',
    CUSTOM_RANGE = 'custom_range',
}

export type BinRange = {
    from: number | undefined; // first range has from undefined
    to: number | undefined; // last range has to undefined
};

export enum CustomDimensionType {
    BIN = 'bin',
    SQL = 'sql',
}

export interface BaseCustomDimension {
    id: string;
    name: string;
    table: string;
    type: CustomDimensionType;
}

export interface CustomBinDimension extends BaseCustomDimension {
    type: CustomDimensionType.BIN;
    dimensionId: FieldId; // Parent dimension id
    binType: BinType;
    binNumber?: number;
    binWidth?: number;
    customRange?: BinRange[];
}

export interface CustomSqlDimension extends BaseCustomDimension {
    type: CustomDimensionType.SQL;
    sql: string;
    dimensionType: DimensionType;
}

export type CustomDimension = CustomBinDimension | CustomSqlDimension;

export const isCustomDimension = (value: AnyType): value is CustomDimension =>
    value !== undefined &&
    Object.values(CustomDimensionType).includes(value.type);

export const isCustomBinDimension = (
    value: AnyType,
): value is CustomBinDimension =>
    value !== undefined &&
    isCustomDimension(value) &&
    value.type === CustomDimensionType.BIN;

export const isCustomSqlDimension = (
    value: AnyType,
): value is CustomSqlDimension =>
    value !== undefined &&
    isCustomDimension(value) &&
    value.type === CustomDimensionType.SQL;

export type CompiledCustomSqlDimension = CustomSqlDimension & {
    compiledSql: string;
    tablesReferences: Array<string>;
};

export type CompiledCustomDimension =
    | CustomBinDimension
    | CompiledCustomSqlDimension;

export const isCompiledCustomSqlDimension = (
    value: AnyType,
): value is CompiledCustomSqlDimension =>
    isCustomSqlDimension(value) && 'compiledSql' in value;

export type ItemsMap = Record<
    string,
    Field | TableCalculation | CustomDimension | Metric
>;
export type Item = ItemsMap[string];

export interface CustomFormat {
    type: CustomFormatType;
    round?: number | undefined;
    separator?: NumberSeparator;
    currency?: typeof currencies[number] | undefined;
    compact?: CompactOrAlias | undefined;
    prefix?: string | undefined;
    suffix?: string | undefined;
    timeInterval?: TimeFrames;
    custom?: string | undefined;
}

export enum CustomFormatType {
    DEFAULT = 'default',
    PERCENT = 'percent',
    CURRENCY = 'currency',
    NUMBER = 'number',
    ID = 'id',
    DATE = 'date',
    TIMESTAMP = 'timestamp',
    BYTES_SI = 'bytes_si',
    BYTES_IEC = 'bytes_iec',
    CUSTOM = 'custom',
}

export enum TableCalculationType {
    NUMBER = 'number',
    STRING = 'string',
    DATE = 'date',
    TIMESTAMP = 'timestamp',
    BOOLEAN = 'boolean',
}

export type TableCalculation = {
    index?: number;
    name: string;
    displayName: string; // This is a unique property of the table calculation
    sql: string;
    format?: CustomFormat;
    type?: TableCalculationType;
};

export type TableCalculationMetadata = {
    oldName: string;
    name: string;
};

export enum FieldType {
    METRIC = 'metric',
    DIMENSION = 'dimension',
}

// This type check is a little fragile because it's based on
// 'displayName'. Ideally these would all have fieldTypes.
export const isTableCalculation = (
    item: ItemsMap[string] | AdditionalMetric | Pick<Field, 'table' | 'name'>,
): item is TableCalculation =>
    item
        ? !isCustomDimension(item) &&
          !!('sql' in item && item.sql) &&
          !('description' in item) &&
          !('tableName' in item) &&
          'displayName' in item
        : false;

export type CompiledTableCalculation = TableCalculation & {
    compiledSql: string;
};

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
    // @deprecated Use format expression instead
    compact?: CompactOrAlias;
    // @deprecated Use format expression instead
    round?: number;
    format?: Format | string; // Format type is deprecated, use format expression(string) instead
    /**
     * @deprecated Use groups property instead.
     */
    groupLabel?: string;
    groups?: string[];
    urls?: FieldUrl[];
    index?: number;
    tags?: string[];
}

export const isField = (field: AnyType): field is Field =>
    field ? !!field.fieldType : false;

// Field ids are unique across the project
export type FieldId = string;

export const convertFieldRefToFieldId = (
    fieldRef: string,
    fallbackTableName?: string,
) => {
    const parts = fieldRef.split('.');
    if (parts.length !== 2) {
        if (fallbackTableName) {
            return `${fallbackTableName}_${fieldRef}`;
        }
        throw new CompileError(
            `Table calculation contains an invalid reference: ${fieldRef}. References must be of the format "table.field"`,
            {},
        );
    }
    const [tableName, fieldName] = parts;

    return `${tableName}_${fieldName}`;
};

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
    /**
     * @deprecated Use groups property instead.
     */
    group?: string;
    requiredAttributes?: Record<string, string | string[]>;
    timeInterval?: TimeFrames;
    timeIntervalBaseDimensionName?: string;
    isAdditionalDimension?: boolean;
    colors?: Record<string, string>;
    isIntervalBase?: boolean;
}

export interface CompiledDimension extends Dimension {
    compiledSql: string; // sql string with resolved template variables
    tablesReferences: Array<string> | undefined;
    tablesRequiredAttributes?: Record<
        string,
        Record<string, string | string[]>
    >;
}

export type CompiledField = CompiledDimension | CompiledMetric;

export const isDimension = (
    field: ItemsMap[string] | AdditionalMetric | undefined, // NOTE: `ItemsMap converts AdditionalMetric to Metric
): field is Dimension =>
    isField(field) && field.fieldType === FieldType.DIMENSION;

export interface CompiledMetric extends Metric {
    compiledSql: string;
    tablesReferences: Array<string> | undefined;
    tablesRequiredAttributes?: Record<
        string,
        Record<string, string | string[]>
    >;
}

export interface FilterableDimension extends Dimension {
    type:
        | DimensionType.STRING
        | DimensionType.NUMBER
        | DimensionType.DATE
        | DimensionType.TIMESTAMP
        | DimensionType.BOOLEAN;
}

export type FieldRef = string;
export const getFieldRef = (field: Pick<Field, 'table' | 'name'>): FieldRef =>
    `${field.table}.${field.name}`;

export const getFieldLabel = (field: Field): string =>
    `${field.tableLabel} ${field.label}`;

export enum MetricType {
    PERCENTILE = 'percentile',
    AVERAGE = 'average',
    COUNT = 'count',
    COUNT_DISTINCT = 'count_distinct',
    SUM = 'sum',
    MIN = 'min',
    MAX = 'max',
    NUMBER = 'number',
    MEDIAN = 'median',
    STRING = 'string',
    DATE = 'date',
    TIMESTAMP = 'timestamp',
    BOOLEAN = 'boolean',
}

export enum Format {
    KM = 'km',
    MI = 'mi',
    USD = 'usd',
    GBP = 'gbp',
    EUR = 'eur',
    JPY = 'jpy',
    DKK = 'dkk',
    ID = 'id',
    PERCENT = 'percent',
}

export const isFormat = (value: string | undefined): value is Format =>
    !!value && Object.values(Format).includes(value as Format);

export const parseMetricType = (metricType: string): MetricType => {
    switch (metricType) {
        case 'percentile':
            return MetricType.PERCENTILE;
        case 'median':
            return MetricType.MEDIAN;
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
        case 'timestamp':
            return MetricType.TIMESTAMP;
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
    MetricType.TIMESTAMP,
    MetricType.BOOLEAN,
];

export const isMetric = (
    field: ItemsMap[string] | AdditionalMetric | undefined,
): field is Metric =>
    field
        ? 'fieldType' in field && field.fieldType === FieldType.METRIC
        : false;

export const isNonAggregateMetric = (field: Field): boolean =>
    isMetric(field) && NonAggregateMetricTypes.includes(field.type);

export const isCompiledMetric = (
    field: ItemsMap[string] | AdditionalMetric | undefined,
): field is CompiledMetric => isMetric(field) && 'compiledSql' in field;

export interface Metric extends Field {
    fieldType: FieldType.METRIC;
    type: MetricType;
    showUnderlyingValues?: string[];
    filters?: MetricFilterRule[];
    percentile?: number;
    formatOptions?: CustomFormat;
    dimensionReference?: string; // field id of the dimension this metric is based on
    requiredAttributes?: Record<string, string | string[]>; // Required attributes for the dimension this metric is based on
    defaultTimeDimension?: DefaultTimeDimension; // Default time dimension for the metric when the user has not specified a time dimension
    spotlight?: {
        visibility: LightdashProjectConfig['spotlight']['default_visibility'];
        categories?: string[]; // yaml_reference
    };
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

// TODO: FilterableField === FilterableItem, we should remove one of them, as well as one of the type guards
export type FilterableField =
    | TableCalculation
    | Metric
    | FilterableDimension
    | CustomSqlDimension;
export const isFilterableField = (
    field: Dimension | ItemsMap[string],
): field is FilterableField =>
    (isDimension(field) && isFilterableDimension(field)) ||
    isCustomSqlDimension(field) ||
    isMetric(field) ||
    isTableCalculation(field);

export type FilterableItem = FilterableField;
export const isFilterableItem = (
    item: ItemsMap[string] | TableCalculation,
): item is FilterableItem =>
    isDimension(item) ? isFilterableDimension(item) : true;

export const defaultSql = (columnName: string): string =>
    // eslint-disable-next-line no-useless-escape
    `\$\{TABLE\}.${columnName}`;
export const capitalize = (word: string): string =>
    word ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}` : '';
export const friendlyName = (text: string): string => {
    if (text === '') {
        return '';
    }

    // Split the text on underscores, filter out empty parts resulting from leading/trailing underscores
    const parts = text.split('_').filter((part) => part !== '');

    // Normalize and capitalize each part of the split text
    const normalizedParts = parts.map((part) => {
        // Convert part to lowercase if it is entirely uppercase, otherwise leave it as is
        const normalisedText =
            part === part.toUpperCase() ? part.toLowerCase() : part;

        // Use a regex to separate numeric and alphabetic sequences
        // The match array will contain the first matched part and any subsequent ones
        const [first, ...rest] =
            normalisedText.match(/[0-9]*[A-Za-z][a-z]*|[0-9]+/g) || [];

        // If no match was found, return the part as is
        if (!first) {
            return part;
        }

        // Capitalize the first matched part, convert the rest to lowercase, and join them with spaces
        return [
            capitalize(first.toLowerCase()),
            ...rest.map((word) => word.toLowerCase()),
        ].join(' ');
    });

    // Join the normalized parts with spaces and capitalize the first letter of the resulting string
    const result = normalizedParts.join(' ');
    return capitalize(result);
};

export const isSummable = (item: Item | undefined) => {
    if (!item) {
        return false;
    }

    if (isTableCalculation(item)) {
        return false;
    }
    if (isCustomDimension(item)) {
        return false;
    }
    const numericTypes: string[] = [MetricType.COUNT, MetricType.SUM];
    const isNumberDimension =
        isDimension(item) && item.type === DimensionType.NUMBER;
    const isNumbericType =
        numericTypes.includes(item.type) || isNumberDimension;
    const isPercent = item.format === 'percent';
    const isDatePart = isDimension(item) && item.timeInterval;
    return isNumbericType && !isPercent && !isDatePart;
};

const SIByteCompacts: Compact[] = [
    Compact.KILOBYTES,
    Compact.MEGABYTES,
    Compact.GIGABYTES,
    Compact.TERABYTES,
    Compact.PETABYTES,
];

export const IECByteCompacts: Compact[] = [
    Compact.KIBIBYTES,
    Compact.MEBIBYTES,
    Compact.GIBIBYTES,
    Compact.TEBIBYTES,
    Compact.PEBIBYTES,
];

export function getCompactOptionsForFormatType(
    type: CustomFormatType,
): Compact[] {
    if (type === CustomFormatType.BYTES_IEC) return IECByteCompacts;
    if (type === CustomFormatType.BYTES_SI) return SIByteCompacts;
    return [
        Compact.THOUSANDS,
        Compact.MILLIONS,
        Compact.BILLIONS,
        Compact.TRILLIONS,
    ];
}
