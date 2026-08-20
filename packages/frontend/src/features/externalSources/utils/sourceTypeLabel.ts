import { assertUnreachable, ExternalSourceType } from '@lightdash/common';

export const getExternalSourceTypeLabel = (
    sourceType: ExternalSourceType,
): string => {
    switch (sourceType) {
        case ExternalSourceType.CSV:
            return 'CSV file';
        case ExternalSourceType.GOOGLE_SHEETS:
            return 'Google Sheet';
        default:
            return assertUnreachable(
                sourceType,
                'Unknown external source type',
            );
    }
};
