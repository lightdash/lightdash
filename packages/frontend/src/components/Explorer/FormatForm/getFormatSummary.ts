import { CustomFormatType } from '@lightdash/common';

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
