import { QueryHistoryStatus } from '@lightdash/common';
import i18n from '../../../i18n/i18n';

export const getQueryLoadingStateCopy = (
    queryStatus?: QueryHistoryStatus,
): { title: string; description?: string } => {
    switch (queryStatus) {
        case QueryHistoryStatus.QUEUED:
            return {
                title: i18n.t('queryLoadingState.queued.title', {
                    ns: 'explorer',
                }),
                description: i18n.t('queryLoadingState.queued.description', {
                    ns: 'explorer',
                }),
            };
        case QueryHistoryStatus.EXECUTING:
            return {
                title: i18n.t('queryLoadingState.executing', {
                    ns: 'explorer',
                }),
            };
        default:
            return {
                title: i18n.t('queryLoadingState.loading', { ns: 'explorer' }),
            };
    }
};
