import assertUnreachable from '../utils/assertUnreachable';
import { getItemType } from '../utils/item';
import {
    DimensionType,
    MetricType,
    TableCalculationType,
    type CustomFormat,
    type Item,
    type NumberSeparator,
} from './field';
import { type AdditionalMetric } from './metricQuery';
import { type TimeFrames } from './timeFrames';

export type ResultValue = {
    raw: unknown;
    formatted: string;
};

export const isResultValue = (
    value: unknown,
): value is { value: ResultValue } =>
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof value.value === 'object' &&
    value.value !== null &&
    'raw' in value.value &&
    'formatted' in value.value;

export function convertItemTypeToDimensionType(
    item: Item | AdditionalMetric,
): DimensionType {
    const type = getItemType(item);
    switch (type) {
        case DimensionType.STRING:
        case MetricType.STRING:
        case TableCalculationType.STRING:
            return DimensionType.STRING;
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case MetricType.PERCENTILE:
        case MetricType.MEDIAN:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.SUM_DISTINCT:
        case MetricType.AVERAGE_DISTINCT:
        case MetricType.MIN:
        case MetricType.MAX:
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL:
        case TableCalculationType.NUMBER:
            return DimensionType.NUMBER;
        case DimensionType.TIMESTAMP:
        case MetricType.TIMESTAMP:
        case TableCalculationType.TIMESTAMP:
            return DimensionType.TIMESTAMP;
        case DimensionType.DATE:
        case MetricType.DATE:
        case TableCalculationType.DATE:
            return DimensionType.DATE;
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
        case TableCalculationType.BOOLEAN:
            return DimensionType.BOOLEAN;
        default: {
            return assertUnreachable(
                type,
                `No dimension type found for field type: ${type}`,
            );
        }
    }
}

export type ResultColumnProvenance = {
    /** Key into the query's fields map (query_history.fields). */
    fieldId: string;
    /**
     * Which query in a multi-source pipeline the field belongs to. Omitted
     * for single-query results. Two composer nodes can both expose the same
     * field name, so a bare fieldId is ambiguous across sources.
     */
    sourceQueryUuid?: string;
};

/**
 * How a NUMBER column's values are represented at the source, so a typed
 * read can bind them without loss. Absent ⇒ unknown, read as DOUBLE.
 */
export type ResultNumericKind =
    | { kind: 'integer' }
    | { kind: 'decimal'; scale: number }
    | { kind: 'float' };

export type ResultColumn = {
    reference: string;
    type: DimensionType; // Lightdash simple type. In the future, we might introduce the warehouse type as well, which provides more detail.
    /** Only meaningful for NUMBER columns; carried when the driver reports it. */
    numericKind?: ResultNumericKind;
    /** Display label. Absent ⇒ consumers fall back to the reference. */
    label?: string;
    /**
     * Lightdash format expression: ECMA-376 with in-repo extensions (IEC
     * bytes, tz-shift for date expressions). MUST be rendered with
     * formatValueWithExpression, never raw numfmt.
     */
    format?: string;
    /** The expression cannot encode locale — carried beside it, mirroring
     *  Field.separator / getFieldFormatOverrideProps. */
    separator?: NumberSeparator;
    /** Escape hatch for the non-expressible formats: Compact.AUTO and
     *  negative round (magnitude rounding). Mirrors getFieldFormatOverrideProps. */
    formatOptions?: CustomFormat;
    /** Temporal grain. Required for QUARTER (no ECMA-376 token) and for
     *  export paths (GSheets) that branch on grain. */
    timeInterval?: TimeFrames;
    /** Resolved output of getFormatterTimezone: whether values shift into the
     *  display timezone. Saves consumers from needing skipTimezoneConversion /
     *  baseDimensionType. */
    shiftsTimezone?: boolean;
    /** Absent ⇒ no semantic field behind this column (computed DuckDB column,
     *  raw SQL column, table calc, join key). Absence gates interaction
     *  capabilities (drill, underlying data, URLs) off — by design. */
    provenance?: ResultColumnProvenance;
};

export type ResultColumns = Record<string, ResultColumn>;

export type ResultRow = Record<string, { value: ResultValue }>;

type RawResultValue = unknown;

export type RawResultRow = Record<string, RawResultValue>;

export const isRawResultRow = (value: unknown): value is RawResultValue =>
    typeof value !== 'object' || value === null;
