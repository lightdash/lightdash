import moment from 'moment';
import {
    DimensionType,
    Field,
    isDimension,
    isField,
    MetricType,
} from '../types/field';
import {
    AdditionalMetric,
    isAdditionalMetric,
    TableCalculation,
} from '../types/metricQuery';
import { NumberStyle } from '../types/savedCharts';
import { TimeFrames } from '../types/timeFrames';

export const formatBoolean = <T>(v: T) =>
    ['True', 'true', 'yes', 'Yes', '1', 'T'].includes(`${v}`) ? 'Yes' : 'No';

export const getDateFormat = (
    timeInterval: TimeFrames | undefined = TimeFrames.DAY,
): string => {
    let dateForm: string;
    switch (timeInterval) {
        case TimeFrames.YEAR:
            dateForm = 'YYYY';
            break;
        case TimeFrames.QUARTER:
            dateForm = 'YYYY-[Q]Q';
            break;
        case TimeFrames.MONTH:
            dateForm = 'YYYY-MM';
            break;
        default:
            dateForm = 'YYYY-MM-DD';
            break;
    }
    return dateForm;
};
export function formatDate<T = string | Date>(
    date: T,
    timeInterval: TimeFrames | undefined = TimeFrames.DAY,
    convertToUTC: boolean = false,
): string {
    const momentDate = convertToUTC ? moment(date).utc() : moment(date);
    return momentDate.format(getDateFormat(timeInterval));
}

export const parseDate = (
    str: string,
    timeInterval: TimeFrames | undefined = TimeFrames.DAY,
): Date => moment(str, getDateFormat(timeInterval)).toDate();

const getTimeFormat = (
    timeInterval: TimeFrames | undefined = TimeFrames.DAY,
): string => {
    let timeFormat: string;
    switch (timeInterval.toUpperCase()) {
        case TimeFrames.HOUR:
            timeFormat = 'HH';
            break;
        case TimeFrames.MINUTE:
            timeFormat = 'HH:mm';
            break;
        default:
            timeFormat = 'HH:mm:ss:SSS';
            break;
    }
    return `YYYY-MM-DD, ${timeFormat} (Z)`;
};

export function formatTimestamp<T = string | Date>(
    value: T,
    timeInterval: TimeFrames | undefined = TimeFrames.MILLISECOND,
    convertToUTC: boolean = false,
): string {
    const momentDate = convertToUTC ? moment(value).utc() : moment(value);
    return momentDate.format(getTimeFormat(timeInterval));
}

export const parseTimestamp = (
    str: string,
    timeInterval: TimeFrames | undefined = TimeFrames.MILLISECOND,
): Date => moment(str, getTimeFormat(timeInterval)).toDate();

export function valueIsNaN(value: any) {
    if (typeof value === 'boolean') return true;
    return Number.isNaN(Number(value));
}

function roundNumber(
    value: any,
    round: number | undefined,
    format: string | undefined,
    numberStyle?: string | undefined,
): string {
    if (valueIsNaN(value)) {
        return `${value}`;
    }

    const invalidRound = round === undefined || round < 0;
    if (invalidRound && !format) {
        return numberStyle && !Number.isInteger(value)
            ? `${value}`
            : new Intl.NumberFormat('en-US').format(Number(value));
    }
    const isValidFormat =
        !!format && format !== 'km' && format !== 'mi' && format !== 'percent';

    if (isValidFormat) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: format?.toUpperCase(),
            maximumFractionDigits: round || 0,
            minimumFractionDigits: round || 0,
        }).format(Number(value));
    }

    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: round || 0,
        minimumFractionDigits: round || 0,
    }).format(Number(value));
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
            return `${roundNumber(
                Number(value) / 1000,
                round,
                format,
                numberStyle,
            )}K`;
        case NumberStyle.MILLIONS:
            return `${roundNumber(
                Number(value) / 1000000,
                round,
                format,
                numberStyle,
            )}M`;
        case NumberStyle.BILLIONS:
            return `${roundNumber(
                Number(value) / 1000000000,
                round,
                format,
                numberStyle,
            )}B`;
        default:
            return `${new Intl.NumberFormat('en-US').format(Number(value))}`;
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
        case 'gbp':
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

export function formatFieldValue(
    field: Field | AdditionalMetric | undefined,
    value: any,
    convertToUTC?: boolean,
): string {
    if (value === null) return '∅';
    if (value === undefined) return '-';
    if (!field) {
        return `${value}`;
    }
    const { type, round, format } = field;
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
            return formatValue(format, round, value);
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
            return formatBoolean(value);
        case DimensionType.DATE:
        case MetricType.DATE:
            return formatDate(
                value,
                isDimension(field) ? field.timeInterval : undefined,
                convertToUTC,
            );
        case DimensionType.TIMESTAMP:
            return formatTimestamp(
                value,
                isDimension(field) ? field.timeInterval : undefined,
                convertToUTC,
            );
        case MetricType.MAX:
        case MetricType.MIN: {
            if (value instanceof Date) {
                return formatTimestamp(
                    value,
                    isDimension(field) ? field.timeInterval : undefined,
                    convertToUTC,
                );
            }
            return formatValue(format, round, value);
        }
        default: {
            return `${value}`;
        }
    }
}

export function formatItemValue(
    item: Field | AdditionalMetric | TableCalculation | undefined,
    value: any,
    convertToUTC?: boolean,
): string {
    if (value === null) return '∅';
    if (value === undefined) return '-';
    return isField(item) || isAdditionalMetric(item)
        ? formatFieldValue(item, value, convertToUTC)
        : formatValue(undefined, undefined, value);
}
