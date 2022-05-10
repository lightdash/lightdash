import moment from 'moment';
import { format } from 'path';
import {
    Dimension,
    DimensionType,
    isDimension,
    Metric,
    MetricType,
} from '../types/field';
import { AdditionalMetric } from '../types/metricQuery';
import { NumberStyle } from '../types/savedCharts';

const formatBoolean = <T>(v: T) =>
    ['True', 'true', 'yes', 'Yes', '1', 'T'].includes(`${v}`) ? 'Yes' : 'No';

function formatDate<T = string | Date>(
    date: T,
    timeInterval: string | undefined = 'DAY',
): string {
    let dateForm: string;
    switch (timeInterval.toUpperCase()) {
        case 'YEAR':
            dateForm = 'YYYY';
            break;
        case 'MONTH':
            dateForm = 'YYYY-MM';
            break;
        default:
            dateForm = 'YYYY-MM-DD';
            break;
    }
    return moment(date).format(dateForm);
}

function formatTimestamp<T = string | Date>(
    value: T,
    timeInterval: string | undefined = 'MILLISECOND',
): string {
    let timeFormat: string;
    switch (timeInterval.toUpperCase()) {
        case 'HOUR':
            timeFormat = 'HH';
            break;
        case 'MINUTE':
            timeFormat = 'HH:mm';
            break;
        case 'SECOND':
            timeFormat = 'HH:mm:ss';
            break;
        default:
            timeFormat = 'HH:mm:ss:SSS';
            break;
    }

    return moment(value).format(`YYYY-MM-DD, ${timeFormat} (Z)`);
}

function valueIsNaN(value: any) {
    if (typeof value === 'boolean') return true;
    return Number.isNaN(Number(value));
}

function roundNumber(
    value: any,
    round: number | undefined,
    format: string | undefined,
): string {
    if (valueIsNaN(value)) {
        return `${value}`;
    }

    const invalidRound = round === undefined || round < 0;
    if (invalidRound || !format) {
        return `${value}`;
    }
    const isValidFormat =
        format && format !== 'km' && format !== 'mi' && format != 'percent';

    console.log(value, round, format);

    if (isValidFormat) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: format?.toUpperCase(),
            maximumFractionDigits: round || 0,
            minimumFractionDigits: round || 0,
        }).format(Number(value));
    }

    return !Number.isInteger(value)
        ? Number(value).toFixed(round)
        : Number(Number(value).toLocaleString()).toFixed(round);
}

function styleNumber(
    value: any,
    numberStyle: NumberStyle | undefined,
    round: number | undefined,
    format: string | undefined,
): string {
    if (valueIsNaN(value)) {
        return `${value}`;
    }
    switch (numberStyle) {
        case NumberStyle.THOUSANDS:
            return `${roundNumber(Number(value) / 1000, round, format)}K`;
        case NumberStyle.MILLIONS:
            return `${roundNumber(Number(value) / 1000000, round, format)}M`;
        case NumberStyle.BILLIONS:
            return `${roundNumber(Number(value) / 1000000000, round, format)}B`;
        default:
            return `${Number(value).toLocaleString()}`;
    }
}

export function formatValue(
    format: string | undefined,
    round: number | undefined,
    value: any,
    numberStyle?: NumberStyle, // for bigNumbers
): string {
    if (value === null) return '∅';
    if (value === undefined) return '-';

    const styledValue = numberStyle
        ? styleNumber(value, numberStyle, round, format)
        : roundNumber(value, round, format);
    switch (format) {
        case 'km':
        case 'mi':
            return `${styledValue} ${format}`;
        case 'usd':
            return `${styledValue}`;
        case 'gbp':
            return `${styledValue}`;
        case 'eur':
            return `${styledValue}`;
        case 'percent':
            if (valueIsNaN(value)) {
                return `${value}`;
            }

            // Fix rounding issue
            return `${(Number(value) * 100).toFixed(round)}%`;

        case '': // no format
            return styledValue;
        default:
            // unrecognized format
            return styledValue;
    }
}

export function formatFieldValue<T>(
    field: Dimension | Metric | AdditionalMetric,
    value: T,
): string {
    const { type, round, format } = field;
    if (value === null) return '∅';
    if (value === undefined) return '-';
    switch (type) {
        case DimensionType.STRING:
        case MetricType.STRING:
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX:
            return formatValue(format, round, value);
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
            return formatBoolean(value);
        case DimensionType.DATE:
        case MetricType.DATE:
            return formatDate(
                value,
                isDimension(field) ? field.timeInterval : undefined,
            );
        case DimensionType.TIMESTAMP:
            return formatTimestamp(
                value,
                isDimension(field) ? field.timeInterval : undefined,
            );
        default: {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const nope: never = type;
            throw new Error(`Unexpected type while formatting value: ${type}`);
        }
    }
}
