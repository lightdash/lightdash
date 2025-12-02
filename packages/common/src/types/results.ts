import assertUnreachable from '../utils/assertUnreachable';
import { getItemType } from '../utils/item';
import {
    DimensionType,
    type Item,
    MetricType,
    TableCalculationType,
} from './field';

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

export function convertItemTypeToDimensionType(item: Item): DimensionType {
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

/**
 * Metadata for period-over-period comparison columns.
 * This allows the frontend to identify PoP columns without string matching.
 */
export type PopColumnMetadata = {
    /** The field ID of the base metric this PoP column compares against */
    baseFieldId: string;
};

export type ResultColumn = {
    reference: string;
    type: DimensionType; // Lightdash simple type. In the future, we might introduce the warehouse type as well, which provides more detail.
    /**
     * Present when this column is a period-over-period comparison column.
     * Contains metadata linking this column to its base metric.
     */
    popMetadata?: PopColumnMetadata;
};

export type ResultColumns = Record<string, ResultColumn>;

export type ResultRow = Record<string, { value: ResultValue }>;

type RawResultValue = unknown;

export type RawResultRow = Record<string, RawResultValue>;

export const isRawResultRow = (value: unknown): value is RawResultValue =>
    typeof value !== 'object' || value === null;
