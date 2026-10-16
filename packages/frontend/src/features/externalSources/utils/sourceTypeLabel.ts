import { assertUnreachable, ExternalSourceType } from '@lightdash/common';
import i18n from '../../../i18n/i18n';

export const getExternalSourceTypeLabel = (
    sourceType: ExternalSourceType,
): string => {
    switch (sourceType) {
        case ExternalSourceType.CSV:
            return i18n.t('externalSources.sourceType.csv', { ns: 'sync' });
        case ExternalSourceType.GOOGLE_SHEETS:
            return i18n.t('externalSources.sourceType.googleSheets', {
                ns: 'sync',
            });
        default:
            return assertUnreachable(
                sourceType,
                'Unknown external source type',
            );
    }
};
