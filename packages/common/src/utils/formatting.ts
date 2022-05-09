import moment from 'moment';
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

export function formatValue<T>(
    format: string | undefined,
    round: number | undefined,
    value: T,
    numberStyle?: NumberStyle, // for bigNumbers
): string {
    function valueIsNaN(val: T) {
        if (typeof val === 'boolean') return true;
        return Number.isNaN(Number(val));
    }

    function roundNumber(number: T): string | T {
        if (round === undefined || round < 0) return number;
        if (valueIsNaN(number)) {
            return number;
        }
        return Number(number).toFixed(round);
    }

    if (value === null) return '∅';
    if (value === undefined) return '-';

    function styleNumber(number: T): string | T {
        if (valueIsNaN(number)) {
            return number;
        }
        switch (numberStyle) {
            case NumberStyle.THOUSANDS:
                return `${roundNumber((Number(number) / 1000) as any)}K`;
            case NumberStyle.MILLIONS:
                return `${roundNumber((Number(number) / 1000000) as any)}M`;
            case NumberStyle.BILLIONS:
                return `${roundNumber((Number(number) / 1000000000) as any)}B`;
            default:
                return number;
        }
    }

    const styledValue = numberStyle
        ? (styleNumber(value) as any)
        : roundNumber(value);
    switch (format) {
        case 'km':
        case 'mi':
            return `${styledValue} ${format}`;
        case 'usd':
            return `$${styledValue}`;
        case 'gbp':
            return `£${styledValue}`;
        case 'eur':
            return `€${styledValue}`;
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
            return `${value}`;
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
