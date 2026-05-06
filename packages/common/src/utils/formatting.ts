import dayjs from 'dayjs';
import dayjsTimezone from 'dayjs/plugin/timezone';
import moment, { type MomentInput } from 'moment-timezone';
import {
    format as formatWithExpression,
    isDateFormat,
    isTextFormat,
    isValidFormat,
} from 'numfmt';
import { LightdashParameters } from '../compiler/parameters';
import {
    CompactConfigMap,
    CustomFormatType,
    DimensionType,
    findCompactConfig,
    Format,
    IECByteCompacts,
    isCustomSqlDimension,
    isDimension,
    isField,
    isFormat,
    isMetric,
    isTableCalculation,
    MetricType,
    NumberSeparator,
    TableCalculationType,
    type CompactOrAlias,
    type CustomDimension,
    type CustomFormat,
    type Dimension,
    type Field,
    type Item,
    type TableCalculation,
} from '../types/field';
import {
    hasFormatOptions,
    isAdditionalMetric,
    type AdditionalMetric,
} from '../types/metricQuery';
import { TimeFrames } from '../types/timeFrames';
import assertUnreachable from './assertUnreachable';
import { evaluateConditionalFormatExpression } from './conditionalFormatExpressions';
import { getItemType, isNumericItem } from './item';

dayjs.extend(dayjsTimezone);

export const currencies = [
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'DKK',
    'CHF',
    'CAD',
    'AUD',
    'CNY',
    'ARS',
    'BRL',
    'CLP',
    'COP',
    'CZK',
    'HKD',
    'HUF',
    'INR',
    'ILS',
    'KRW',
    'MYR',
    'MXN',
    'MAD',
    'NZD',
    'NOK',
    'PHP',
    'PLN',
    'RUB',
    'SAR',
    'SGD',
    'ZAR',
    'SEK',
    'TWD',
    'THB',
    'TRY',
    'VND',
];

export const formatBoolean = <T>(v: T) =>
    ['True', 'true', 'yes', 'Yes', '1', 'T'].includes(`${v}`)
        ? 'True'
        : 'False';

export const getDateFormat = (
    timeInterval: TimeFrames | undefined = TimeFrames.DAY,
): string => {
    switch (timeInterval) {
        case TimeFrames.YEAR:
            return 'YYYY';
        case TimeFrames.QUARTER:
            return 'YYYY-[Q]Q';
        case TimeFrames.MONTH:
            return 'YYYY-MM';
        default:
            return 'YYYY-MM-DD';
    }
};

const getTimeFormat = (
    timeInterval: TimeFrames | undefined = TimeFrames.DAY,
): string => {
    let timeFormat: string;
    switch (timeInterval) {
        case TimeFrames.HOUR:
            timeFormat = 'HH';
            break;
        case TimeFrames.MINUTE:
            timeFormat = 'HH:mm';
            break;
        case TimeFrames.SECOND:
            timeFormat = 'HH:mm:ss';
            break;
        default:
            timeFormat = 'HH:mm:ss:SSS';
            break;
    }
    return `YYYY-MM-DD, ${timeFormat} (Z)`;
};

// TODO: To rename to isDayJsInput once we remove moment usage
export const isMomentInput = (value: unknown): value is MomentInput =>
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Date ||
    value instanceof moment ||
    value instanceof dayjs;

export function formatDate(
    date: MomentInput,
    timeInterval: TimeFrames = TimeFrames.DAY,
    convertToUTC: boolean = false,
    timezone?: string,
): string {
    let momentDate;
    if (timezone) {
        momentDate = moment.utc(date).tz(timezone);
    } else if (convertToUTC) {
        momentDate = moment.utc(date);
    } else {
        momentDate = moment(date);
    }

    if (!momentDate.isValid()) {
        return 'NaT';
    }

    return momentDate.format(getDateFormat(timeInterval));
}

// Pass `timezone` to convert the UTC value into that zone. Pass `displayTimezone`
// when the value is already wall-clock in that zone — it only appends the offset
// suffix. Pass at most one.
export function formatTimestamp(
    value: MomentInput,
    timeInterval: TimeFrames | undefined = TimeFrames.MILLISECOND,
    convertToUTC: boolean = false,
    timezone?: string,
    displayTimezone?: string,
): string {
    let momentDate;
    if (timezone) {
        momentDate = moment.utc(value).tz(timezone);
    } else if (convertToUTC) {
        momentDate = moment.utc(value);
    } else {
        momentDate = moment(value);
    }

    if (!momentDate.isValid()) {
        return 'NaT';
    }

    if (!timezone && displayTimezone) {
        const offsetMinutes = moment.tz(value, displayTimezone).utcOffset();
        return momentDate
            .utcOffset(offsetMinutes, true)
            .format(getTimeFormat(timeInterval));
    }

    return momentDate.format(getTimeFormat(timeInterval));
}

// Date whose UTC components match `value` rendered in `timezone`.
// ExcelJS serializes Date cells via UTC components and Excel cells
// carry no zone — this is how we land project-tz wall-clock in a
// real date cell. Resulting Date no longer represents a real instant.
export function toExcelWallClockDate(
    value: MomentInput,
    timezone: string,
): Date {
    return moment.tz(value, timezone).utc(true).toDate();
}

// Re-encode a UTC instant as ISO 8601 in the project tz with an explicit
// offset suffix (e.g. `2024-01-14T15:00:00.000-11:00`). Returns undefined
// when there's nothing to shift; callers fall through to passthrough so
// flag-off / UTC output stays bit-identical.
export const toIsoWithProjectOffset = (
    rawValue: unknown,
    timezone: string | undefined,
): string | undefined => {
    if (!timezone || timezone === 'UTC') return undefined;
    if (
        typeof rawValue !== 'string' &&
        typeof rawValue !== 'number' &&
        !(rawValue instanceof Date)
    ) {
        return undefined;
    }
    const m = moment.utc(rawValue);
    if (!m.isValid()) return undefined;
    return m.tz(timezone).toISOString(true);
};

// TIMESTAMP fields and TIMESTAMP-base DATE intervals (DATE_TRUNC round-trip)
// carry a real instant — both shift into the project tz for export.
// Calendar DATEs (no time component) stay put.
export const isShiftableForTzExport = (item: Item | undefined): boolean => {
    if (!isField(item)) return false;
    if (item.type === DimensionType.TIMESTAMP) return true;
    return (
        item.type === DimensionType.DATE &&
        isDimension(item) &&
        item.timeIntervalBaseDimensionType === DimensionType.TIMESTAMP
    );
};

// Renders a temporal cell as the wall-clock string Excel and Google Sheets
// auto-detect as a date. TIMESTAMP → `YYYY-MM-DD HH:mm:ss.SSS`, DATE →
// `YYYY-MM-DD`. Shifts into the project tz when the item is timezone-
// shiftable (TIMESTAMP / DATE-base-TS) and a timezone is supplied; calendar
// DATEs are formatted as-is. Returns undefined for non-temporal fields or
// unparseable values so callers can fall through to their existing
// formatting path.
export const formatTemporalCellForSpreadsheet = (
    item: Item | undefined,
    rawValue: unknown,
    timezone: string | undefined,
): string | undefined => {
    if (!isField(item)) return undefined;
    const isTimestamp = item.type === DimensionType.TIMESTAMP;
    const isDate = item.type === DimensionType.DATE;
    if (!isTimestamp && !isDate) return undefined;
    if (rawValue === null || rawValue === undefined || rawValue === '') {
        return undefined;
    }
    const shouldShift = !!timezone && isShiftableForTzExport(item);
    const m = shouldShift
        ? moment.utc(rawValue as MomentInput).tz(timezone!)
        : moment(rawValue as MomentInput);
    if (!m.isValid()) return undefined;
    return m.format(isTimestamp ? 'YYYY-MM-DD HH:mm:ss.SSS' : 'YYYY-MM-DD');
};

export function getLocalTimeDisplay(
    value: MomentInput,
    showTimezone: boolean = true,
): string {
    // NOTE: Mixing dayjs and moment here is not great, but we're doing it here
    // because we are using moment types in this file and the
    // plumbing expects them. It should be ok here because we are not moment and dayjs
    // together to operate on the date. Dayjs is only used for the
    // Timezone string, which moment doesn't support.
    const tzString = showTimezone ? `(${dayjs.tz.guess()})` : '';
    return `${moment(value).format(`YYYY-MM-DD HH:mm`)} ${tzString}`;
}

export const formatDateWithPattern = (
    value: string | number,
    pattern: string,
): string => {
    const m = moment(value).utc();
    if (!m.isValid()) return String(value);
    return m.format(pattern);
};

export const parseDate = (
    str: string,
    timeInterval: TimeFrames | undefined = TimeFrames.DAY,
): Date => moment(str, getDateFormat(timeInterval)).toDate();

export const parseTimestamp = (
    str: string,
    timeInterval: TimeFrames | undefined = TimeFrames.MILLISECOND,
): Date => moment(str, getTimeFormat(timeInterval)).toDate();

function getFormatNumberOptions(value: number, format?: CustomFormat) {
    const hasCurrency =
        format?.type === CustomFormatType.CURRENCY && format?.currency;
    const currencyOptions: Intl.NumberFormatOptions = hasCurrency
        ? { style: 'currency', currency: format.currency }
        : {};

    const round = format?.round;

    if (round === undefined) {
        // When round is not defined, keep up to 3 decimal places
        return hasCurrency ? currencyOptions : {};
    }

    if (round < 0) {
        return {
            maximumSignificantDigits: Math.max(
                Math.floor(value).toString().length + round,
                1,
            ),
            maximumFractionDigits: 0,
            ...currencyOptions,
        };
    }

    const fractionDigits = Math.min(round, 20);
    return {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits,
        ...currencyOptions,
    };
}

export function valueIsNaN(value: unknown) {
    if (typeof value === 'boolean') return true;

    return Number.isNaN(Number(value));
}

export function isNumber(value: unknown): value is number {
    return !valueIsNaN(value);
}

export function formatNumberValue(
    value: number,
    format?: CustomFormat,
): string {
    const options = getFormatNumberOptions(value, format);
    const separator = format?.separator || NumberSeparator.DEFAULT;
    switch (separator) {
        case NumberSeparator.COMMA_PERIOD:
            return value.toLocaleString('en-US', options);
        case NumberSeparator.SPACE_PERIOD:
            return value.toLocaleString('en-US', options).replace(/,/g, ' ');
        case NumberSeparator.PERIOD_COMMA:
            // If currency is provided, having a PERIOD_COMMA separator will also change the position of the currency symbol
            return value.toLocaleString('de-DE', options);
        case NumberSeparator.NO_SEPARATOR_PERIOD:
            return value.toLocaleString('en-US', {
                ...options,
                useGrouping: false,
            });
        case NumberSeparator.DEFAULT:
            // This will apply the default style for each currency
            return value.toLocaleString(undefined, options);
        default:
            return assertUnreachable(separator, 'Unknown separator');
    }
}

export function applyDefaultFormat(value: unknown) {
    if (value === null) return '∅';
    if (value === undefined) return '-';
    if (!isNumber(value)) {
        return `${value}`;
    }

    return formatNumberValue(value);
}

export function getCustomFormatFromLegacy({
    format,
    compact,
    round,
}: {
    format?: Format | string;
    compact?: CompactOrAlias;
    round?: number;
}): CustomFormat {
    switch (format) {
        case Format.EUR:
        case Format.GBP:
        case Format.USD:
        case Format.JPY:
        case Format.DKK:
            return {
                type: CustomFormatType.CURRENCY,
                currency: format.toUpperCase(),
                compact,
                round,
            };
        case Format.KM:
        case Format.MI:
            return {
                type: CustomFormatType.NUMBER,
                suffix: ` ${format}`,
                compact,
                round,
            };
        case Format.PERCENT:
            return {
                type: CustomFormatType.PERCENT,
                compact,
                round,
            };
        case Format.ID:
            return {
                type: CustomFormatType.ID,
            };
        default:
            return {
                type: CustomFormatType.NUMBER,
                round,
                compact,
            };
    }
}

export function hasFormatting(
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
): boolean {
    if (!item) return false;
    if (hasFormatOptions(item)) {
        return true;
    }
    if (isTableCalculation(item)) {
        return item.format !== undefined;
    }
    if (isDimension(item) || isMetric(item)) {
        return (
            item.format !== undefined ||
            item.compact !== undefined ||
            item.round !== undefined
        );
    }
    return false;
}

export function getCustomFormat(
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
) {
    if (!item) return undefined;

    if (hasFormatOptions(item)) {
        return item.formatOptions;
    }

    if (isTableCalculation(item)) {
        return item.format;
    }

    const legacyFormat = {
        ...('format' in item && { format: item.format }),
        ...('compact' in item && { compact: item.compact }),
        ...('round' in item && { round: item.round }),
    };

    // Only get custom format from legacy if there are any legacy format options or if the item is numeric
    if (Object.keys(legacyFormat).length > 0 || isNumericItem(item)) {
        return getCustomFormatFromLegacy(legacyFormat);
    }

    return undefined;
}

function applyCompact(
    value: unknown,
    format?: CustomFormat,
): {
    compactValue: number;
    compactSuffix: string;
} {
    if (format?.compact === undefined)
        return { compactValue: Number(value), compactSuffix: '' };

    const compactConfig = findCompactConfig(format.compact);

    if (compactConfig) {
        const compactValue = compactConfig.convertFn(Number(value));
        const compactSuffix = format.compact ? compactConfig.suffix : '';

        return { compactValue, compactSuffix };
    }

    return { compactValue: Number(value), compactSuffix: '' };
}

export function formatValueWithExpression(expression: string, value: unknown) {
    try {
        let sanitizedValue = value;

        if (typeof value === 'bigint') {
            if (
                value <= Number.MAX_SAFE_INTEGER &&
                value >= Number.MIN_SAFE_INTEGER
            ) {
                sanitizedValue = Number(value);
            } else {
                throw new Error(
                    "Can't format value as BigInt is out of safe integer range",
                );
            }
        }

        // Check if this is a binary (IEC) byte unit format expression using KiB, MiB, etc.
        const binaryByteUnits = IECByteCompacts.map(
            (compact) => CompactConfigMap[compact].suffix,
        );
        const binarySuffixMatch = binaryByteUnits.find((unit) =>
            expression.includes(`"${unit}"`),
        );
        if (binarySuffixMatch && !valueIsNaN(Number(sanitizedValue))) {
            const compactConfig = Object.values(CompactConfigMap).find(
                (config) =>
                    config.suffix === binarySuffixMatch &&
                    IECByteCompacts.includes(config.compact),
            );

            if (compactConfig) {
                const convertedValue = compactConfig.convertFn(
                    Number(sanitizedValue),
                );
                const baseExpression = expression.replace(
                    `"${binarySuffixMatch}"`,
                    '',
                );
                const formattedNumber = formatWithExpression(
                    baseExpression,
                    convertedValue,
                );
                return `${formattedNumber}${binarySuffixMatch}`;
            }
        }

        // format date
        if (isDateFormat(expression)) {
            if (!isMomentInput(sanitizedValue)) {
                return 'NaT';
            }
            return formatWithExpression(
                expression,
                moment(sanitizedValue).toDate(),
                { ignoreTimezone: true },
            );
        }

        // format text
        if (isTextFormat(expression)) {
            return formatWithExpression(expression, sanitizedValue);
        }

        // format number
        return valueIsNaN(Number(sanitizedValue))
            ? `${value}` // Return the raw value as a string if it's not a number
            : formatWithExpression(expression, Number(sanitizedValue));
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error formatting value with expression', e);
        return `${value}`;
    }
}

export function applyCustomFormat(
    value: unknown,
    format?: CustomFormat | undefined,
): string {
    if (format?.type === undefined) return applyDefaultFormat(value);

    if (value === '') return '';

    if (
        value instanceof Date &&
        ![CustomFormatType.DATE, CustomFormatType.TIMESTAMP].includes(
            format.type,
        )
    ) {
        return formatTimestamp(value, undefined, false);
    }

    if (valueIsNaN(value) || value === null) {
        return applyDefaultFormat(value);
    }

    switch (format.type) {
        case CustomFormatType.ID:
            return `${value}`;
        case CustomFormatType.DEFAULT:
            return applyDefaultFormat(value);

        case CustomFormatType.PERCENT:
            const formatted = formatNumberValue(Number(value) * 100, format);
            return `${formatted}%`;
        case CustomFormatType.CURRENCY:
            const { compactValue, compactSuffix } = applyCompact(value, format);

            const currencyFormatted = formatNumberValue(
                compactValue,
                format,
            ).replace(/\u00A0/, ' ');

            return `${currencyFormatted}${compactSuffix}`;
        case CustomFormatType.DATE:
            return formatDate(value, format?.timeInterval, false);
        case CustomFormatType.TIMESTAMP:
            return formatTimestamp(value, format?.timeInterval, false);
        case CustomFormatType.NUMBER:
            const prefix = format.prefix || '';
            const suffix = format.suffix || '';
            const {
                compactValue: compactNumber,
                compactSuffix: compactNumberSuffix,
            } = applyCompact(value, format);

            const numberFormatted = formatNumberValue(compactNumber, format);

            return `${prefix}${numberFormatted}${compactNumberSuffix}${suffix}`;
        case CustomFormatType.BYTES_SI:
        case CustomFormatType.BYTES_IEC: {
            const {
                compactValue: bytesCompactValue,
                compactSuffix: bytesCompactSuffix,
            } = applyCompact(value, format);
            return `${formatNumberValue(
                bytesCompactValue,
                format,
            )}${bytesCompactSuffix}`;
        }
        case CustomFormatType.CUSTOM:
            return formatValueWithExpression(format.custom || '', value);
        default:
            return assertUnreachable(
                format.type,
                `Table calculation format type ${format.type} is not valid`,
            );
    }
}

/**
 * Validates a format string that may contain parameter placeholders.
 * Strips ${...} placeholders before validation since numfmt doesn't understand them.
 */
function isValidFormatWithParameters(formatString: string): boolean {
    // Check if format contains parameter placeholders
    const hasPlaceholders = formatString.includes('${');

    if (!hasPlaceholders) {
        return isValidFormat(formatString);
    }

    // Strip out ${...} placeholders and validate what remains
    // This handles formats like: '${ld.parameters.currency=="usd"?"$":""}0,0.00'
    // After stripping: '0,0.00' which is valid
    const withoutPlaceholders = formatString.replace(/\$\{[^}]+\}/g, '');

    return isValidFormat(withoutPlaceholders);
}

export function hasValidFormatExpression<
    T extends
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | Dimension,
>(item: T | undefined): item is T & { format: string } {
    // filter out legacy format that might be valid expressions. eg: usd
    if (!item || !('format' in item) || !item.format) {
        return false;
    }

    return (
        (isField(item) || isAdditionalMetric(item)) &&
        typeof item.format === 'string' &&
        !isFormat(item.format) &&
        isValidFormatWithParameters(item.format)
    );
}

const customFormatConversionFnMap: Record<
    string,
    (formatExpression: string, format: CustomFormat) => string
> = {
    separator: (formatExpression, format) => {
        if (
            !format.separator ||
            format.separator !== NumberSeparator.NO_SEPARATOR_PERIOD
        ) {
            // Add thousands separator by default
            // Note: we don't support specific separators characters. This depends on the locale which we don't support as we format values in the server atm.
            return `#,##0`;
        }
        return formatExpression;
    },
    currency: (formatExpression, format) => {
        if (format.currency) {
            const mockAmount = 1;
            const mockCurrencyValue = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: format.currency,
            }).format(mockAmount);
            // get the currency symbol/prefix + replace NBSP char
            const currencySymbolPrefix = mockCurrencyValue
                .substring(0, mockCurrencyValue.indexOf(mockAmount.toString()))
                .replace(/\u00A0/, ' ');
            return `[$${currencySymbolPrefix}]${formatExpression}`;
        }
        return formatExpression;
    },
    prefix: (formatExpression, format) => {
        if (format.prefix) {
            return `"${format.prefix}"${formatExpression}`;
        }
        return formatExpression;
    },
    round: (formatExpression, format) => {
        let round: number | null = 2;
        if (format.round !== undefined) {
            round = format.round;
        } else if (
            format.type === CustomFormatType.CURRENCY &&
            format.currency
        ) {
            const mockCurrencyValue = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: format.currency,
            }).format(1);
            // find how many round decimals the currency has
            round = mockCurrencyValue.includes('.')
                ? mockCurrencyValue.split('.')[1].length
                : 0;
        } else if (format.type === CustomFormatType.NUMBER) {
            round = null;
        }

        if (round === null) {
            // Formatting with null round means we want to show up to 3 decimal places
            return `${formatExpression}.###`;
        }

        if (round > 0) {
            return `${formatExpression}.${'0'.repeat(round)}`;
        }
        return formatExpression;
    },
    compact: (formatExpression, format) => {
        if (format.compact) {
            const compactConfig = findCompactConfig(format.compact);
            if (compactConfig) {
                // Check if this is a binary (IEC) byte unit, like KiB, MiB, etc.
                const isBinaryByteUnit = IECByteCompacts.includes(
                    compactConfig.compact,
                );

                if (isBinaryByteUnit) {
                    return `${formatExpression}"${compactConfig.suffix}"`;
                }
                return `${formatExpression}${','.repeat(
                    compactConfig.orderOfMagnitude / 3,
                )}"${compactConfig.suffix}"`;
            }
        }
        return formatExpression;
    },
    percentage: (formatExpression) => `${formatExpression}%`,
    suffix: (formatExpression, format) => {
        if (format.suffix) {
            return `${formatExpression}"${format.suffix}"`;
        }
        return formatExpression;
    },
};

export function convertCustomFormatToFormatExpression(
    format: CustomFormat,
): string | null {
    // ECMA-376 format expression
    let defaultFormatExpression: string | null = null;
    let conversions: Array<string> = [];
    switch (format.type) {
        case CustomFormatType.CUSTOM: {
            // no conversion needed
            return format.custom || null;
        }
        case CustomFormatType.DEFAULT: {
            // No format expression needed
            break;
        }
        case CustomFormatType.CURRENCY: {
            defaultFormatExpression = '0';
            conversions = ['separator', 'currency', 'round', 'compact'];
            break;
        }
        case CustomFormatType.PERCENT: {
            defaultFormatExpression = '0';
            conversions = ['separator', 'round', 'percentage'];
            break;
        }
        case CustomFormatType.NUMBER: {
            defaultFormatExpression = `0`;
            conversions = ['separator', 'prefix', 'round', 'compact', 'suffix'];
            break;
        }
        case CustomFormatType.BYTES_SI: {
            defaultFormatExpression = '0';
            conversions = ['separator', 'round', 'compact'];
            break;
        }
        case CustomFormatType.BYTES_IEC: {
            // ECMA-376 format expressions cannot accurately represent binary (1024-based) scaling
            // Use a special format that includes the suffix but no comma scaling
            defaultFormatExpression = '0';
            conversions = ['separator', 'round', 'compact'];
            break;
        }
        case CustomFormatType.ID:
        case CustomFormatType.DATE:
        case CustomFormatType.TIMESTAMP: {
            // No format expression needed
            break;
        }
        default: {
            return assertUnreachable(
                format.type,
                `Cannot recognise ${format.type} format type`,
            );
        }
    }
    if (defaultFormatExpression === null) {
        return defaultFormatExpression;
    }
    // Apply conversions
    return conversions.reduce<string>(
        (expression, fnKey) =>
            customFormatConversionFnMap[fnKey](expression, format),
        defaultFormatExpression,
    );
}

export function getFormatExpression(
    item: Item | AdditionalMetric,
): string | undefined {
    if (hasValidFormatExpression(item)) {
        return item.format;
    }
    const customFormat = getCustomFormat(item);
    return customFormat
        ? convertCustomFormatToFormatExpression(customFormat) || undefined
        : undefined;
}

export function formatItemValue(
    item:
        | Field
        | Dimension
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
    value: unknown,
    convertToUTC?: boolean,
    parameters?: Record<string, unknown>,
    timezone?: string,
    displayTimezone?: string,
): string {
    if (value === null) return '∅';
    if (value === undefined) return '-';
    if (item) {
        if (hasValidFormatExpression(item)) {
            // Check if format uses parameter placeholders
            const hasParameterPlaceholders =
                item.format.includes(
                    `\${${LightdashParameters.PREFIX_SHORT}`,
                ) || item.format.includes(`\${${LightdashParameters.PREFIX}`);

            // NEW: Handle parameter-based formats separately
            if (hasParameterPlaceholders) {
                // If parameters are provided, evaluate and apply the format
                if (parameters) {
                    const formatExpression =
                        evaluateConditionalFormatExpression(
                            item.format,
                            parameters,
                        );
                    try {
                        const result = formatValueWithExpression(
                            formatExpression,
                            value,
                        );
                        return result;
                    } catch (error) {
                        // If evaluation fails, fall back to default formatting
                        return applyDefaultFormat(value);
                    }
                } else {
                    // No parameters provided but format needs them - use default formatting
                    return applyDefaultFormat(value);
                }
            }

            // EXISTING: Handle non-parameter formats (unchanged behavior)
            try {
                const result = formatValueWithExpression(item.format, value);
                return result;
            } catch (error) {
                // Fall through to custom format handling below
            }
        }

        const customFormat = getCustomFormat(item);

        if (isCustomSqlDimension(item) || 'type' in item) {
            const type = getItemType(item);

            // Date/Timestamp table calculations may carry a CUSTOM format
            // expression (e.g. "mmmm d, yyyy"). The default switch path
            // hardwires formatDate/formatTimestamp and would silently drop
            // it, so honour the custom expression first.
            if (
                (type === TableCalculationType.DATE ||
                    type === TableCalculationType.TIMESTAMP) &&
                customFormat?.type === CustomFormatType.CUSTOM &&
                customFormat.custom &&
                isMomentInput(value)
            ) {
                try {
                    return formatValueWithExpression(
                        customFormat.custom,
                        value,
                    );
                } catch {
                    // Fall through to the default date/timestamp render.
                }
            }

            switch (type) {
                case TableCalculationType.STRING:
                case DimensionType.STRING:
                case MetricType.STRING:
                    return `${value}`;
                case DimensionType.BOOLEAN:
                case MetricType.BOOLEAN:
                case TableCalculationType.BOOLEAN:
                    return formatBoolean(value);
                case DimensionType.DATE:
                case MetricType.DATE:
                case TableCalculationType.DATE: {
                    // Truncated dimensions whose base column is DATE have no
                    // time component — applying a display timezone would
                    // shift the calendar day (off-by-one in negative offsets).
                    const dateTimezone =
                        isDimension(item) &&
                        item.timeIntervalBaseDimensionType ===
                            DimensionType.DATE
                            ? undefined
                            : timezone;
                    return isMomentInput(value)
                        ? formatDate(
                              value,
                              isDimension(item) ? item.timeInterval : undefined,
                              convertToUTC,
                              dateTimezone,
                          )
                        : 'NaT';
                }
                case DimensionType.TIMESTAMP:
                case MetricType.TIMESTAMP:
                case TableCalculationType.TIMESTAMP:
                    return isMomentInput(value)
                        ? formatTimestamp(
                              value,
                              isDimension(item) ? item.timeInterval : undefined,
                              convertToUTC,
                              timezone,
                              displayTimezone,
                          )
                        : 'NaT';
                case MetricType.MAX:
                case MetricType.MIN:
                    if (value instanceof Date && customFormat === undefined) {
                        return formatTimestamp(
                            value,
                            isDimension(item) ? item.timeInterval : undefined,
                            convertToUTC,
                            timezone,
                            displayTimezone,
                        );
                    }
                    break;
                case DimensionType.NUMBER:
                    if (
                        isDimension(item) &&
                        item.timeInterval &&
                        item.timeInterval === TimeFrames.YEAR_NUM // Year number (e.g. 2021) is a number, but should be formatted as a string so there's no separator applied
                    ) {
                        return `${value}`;
                    }
                    break;
                default:
            }
        }

        return applyCustomFormat(value, customFormat);
    }

    return applyDefaultFormat(value);
}
