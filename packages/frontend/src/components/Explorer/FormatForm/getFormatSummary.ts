import {
    CustomFormatType,
    findCompactConfig,
    NumberSeparator,
    timeFrameConfigs,
    type CustomFormat,
} from '@lightdash/common';

export const getFormatTypeLabel = (type: CustomFormatType): string => {
    switch (type) {
        case CustomFormatType.BYTES_SI:
            return 'Bytes (SI)';
        case CustomFormatType.BYTES_IEC:
            return 'Bytes (IEC)';
        case CustomFormatType.DATE:
            return 'Date';
        case CustomFormatType.TIMESTAMP:
            return 'Timestamp';
        case CustomFormatType.DEFAULT:
            return 'Default';
        case CustomFormatType.PERCENT:
            return 'Percent';
        case CustomFormatType.CURRENCY:
            return 'Currency';
        case CustomFormatType.NUMBER:
            return 'Number';
        case CustomFormatType.ID:
            return 'ID';
        case CustomFormatType.CUSTOM:
            return 'Custom';
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
    return round === 1 ? '1 decimal' : `${round} decimals`;
};

// One-line, human-readable reading of a format, e.g. "Currency (USD), 2 decimals"
export const describeCustomFormat = (format: CustomFormat): string => {
    const parts: string[] = [];
    switch (format.type) {
        case CustomFormatType.CURRENCY:
            parts.push(
                format.currency ? `Currency (${format.currency})` : 'Currency',
            );
            break;
        case CustomFormatType.CUSTOM:
            parts.push(format.custom ? `Custom (${format.custom})` : 'Custom');
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
    if (separator) parts.push(`separator ${separator}`);
    if (format.prefix) parts.push(`prefix ${format.prefix}`);
    if (format.suffix) parts.push(`suffix ${format.suffix.trim()}`);
    if (format.timeInterval) {
        parts.push(timeFrameConfigs[format.timeInterval].getLabel());
    }
    return parts.join(', ');
};
