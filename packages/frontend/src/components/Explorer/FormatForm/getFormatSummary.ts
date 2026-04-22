import {
    CustomFormatType,
    findCompactConfig,
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
        case CustomFormatType.CUSTOM:
            return 'Custom';
        default:
            return type;
    }
};

export const getFormatSummary = (format: CustomFormat): string => {
    const type = format.type ?? CustomFormatType.DEFAULT;

    if (type === CustomFormatType.DEFAULT) {
        return 'Default';
    }

    const parts: string[] = [];

    if (type === CustomFormatType.CURRENCY && format.currency) {
        parts.push(format.currency);
    } else {
        parts.push(getFormatTypeLabel(type));
    }

    const supportsRound =
        type === CustomFormatType.PERCENT ||
        type === CustomFormatType.CURRENCY ||
        type === CustomFormatType.NUMBER ||
        type === CustomFormatType.BYTES_SI ||
        type === CustomFormatType.BYTES_IEC;

    if (supportsRound && format.round !== undefined && format.round !== null) {
        parts.push(`${format.round} decimal${format.round === 1 ? '' : 's'}`);
    }

    if (format.compact) {
        const compactConfig = findCompactConfig(format.compact);
        if (compactConfig) parts.push(compactConfig.label.toLowerCase());
    }

    if (type === CustomFormatType.NUMBER) {
        if (format.prefix) parts.push(`prefix "${format.prefix}"`);
        if (format.suffix) parts.push(`suffix "${format.suffix}"`);
    }

    if (
        (type === CustomFormatType.CUSTOM ||
            type === CustomFormatType.DATE ||
            type === CustomFormatType.TIMESTAMP) &&
        format.custom
    ) {
        parts.push(format.custom);
    }

    return parts.join(' · ');
};
