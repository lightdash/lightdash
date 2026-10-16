import {
    CustomFormatType,
    findCompactConfig,
    NumberSeparator,
    timeFrameConfigs,
    type CustomFormat,
} from '@lightdash/common';
import i18n from '../../../i18n/i18n';

const tFormat = (key: string, options?: Record<string, unknown>): string =>
    i18n.t(`formatSummary.${key}`, { ns: 'explorer', ...options });

export const getFormatTypeLabel = (type: CustomFormatType): string => {
    switch (type) {
        case CustomFormatType.BYTES_SI:
            return tFormat('types.bytesSi');
        case CustomFormatType.BYTES_IEC:
            return tFormat('types.bytesIec');
        case CustomFormatType.DATE:
            return tFormat('types.date');
        case CustomFormatType.TIMESTAMP:
            return tFormat('types.timestamp');
        case CustomFormatType.DEFAULT:
            return tFormat('types.default');
        case CustomFormatType.PERCENT:
            return tFormat('types.percent');
        case CustomFormatType.CURRENCY:
            return tFormat('types.currency');
        case CustomFormatType.NUMBER:
            return tFormat('types.number');
        case CustomFormatType.ID:
            return tFormat('types.id');
        case CustomFormatType.CUSTOM:
            return tFormat('types.custom');
        default:
            return type;
    }
};

const separatorExamples: Partial<Record<NumberSeparator, string>> = {
    [NumberSeparator.COMMA_PERIOD]: '100,000.00',
    [NumberSeparator.SPACE_PERIOD]: '100 000.00',
    [NumberSeparator.PERIOD_COMMA]: '100.000,00',
    [NumberSeparator.NO_SEPARATOR_PERIOD]: '100000.00',
    [NumberSeparator.APOSTROPHE_PERIOD]: "100'000.00",
};

const describeDecimals = (round: number | undefined): string | null => {
    if (round === undefined) return null;
    return tFormat('decimals', { count: round });
};

// One-line, human-readable reading of a format, e.g. "Currency (USD), 2 decimals"
export const describeCustomFormat = (format: CustomFormat): string => {
    const parts: string[] = [];
    switch (format.type) {
        case CustomFormatType.CURRENCY:
            parts.push(
                format.currency
                    ? tFormat('currencyWithCode', { currency: format.currency })
                    : getFormatTypeLabel(format.type),
            );
            break;
        case CustomFormatType.CUSTOM:
            parts.push(
                format.custom
                    ? tFormat('customWithExpression', {
                          expression: format.custom,
                      })
                    : getFormatTypeLabel(format.type),
            );
            break;
        default:
            parts.push(getFormatTypeLabel(format.type));
    }
    const decimals = describeDecimals(format.round);
    if (decimals) parts.push(decimals);
    const compact = format.compact ? findCompactConfig(format.compact) : null;
    if (compact) parts.push(compact.label.toLowerCase());
    const separator = format.separator
        ? separatorExamples[format.separator]
        : undefined;
    if (separator) parts.push(tFormat('separator', { separator }));
    if (format.prefix) parts.push(tFormat('prefix', { prefix: format.prefix }));
    if (format.suffix) {
        parts.push(tFormat('suffix', { suffix: format.suffix.trim() }));
    }
    if (format.timeInterval) {
        parts.push(timeFrameConfigs[format.timeInterval].getLabel());
    }
    return parts.join(tFormat('partSeparator'));
};
