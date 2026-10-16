import { type SearchFilters } from '@lightdash/common';
import dayjs from 'dayjs';
import i18n from '../../../i18n/i18n';

const ns = 'omnibar';

export function getDateFilterLabel(filters: SearchFilters = {}) {
    const { fromDate, toDate } = filters;
    const fromDateObj = fromDate ? dayjs(fromDate) : undefined;
    const toDateObj = toDate ? dayjs(toDate) : undefined;
    const dateFmt = 'YYYY-MM-DD';

    if (fromDateObj && !toDateObj) {
        return i18n.t('dateFilter.from', {
            ns,
            date: fromDateObj.format(dateFmt),
        });
    }

    if (!fromDateObj && toDateObj) {
        return i18n.t('dateFilter.to', { ns, date: toDateObj.format(dateFmt) });
    }

    if (fromDateObj?.isSame(toDateObj, 'day')) {
        return fromDateObj?.format(dateFmt);
    }

    if (fromDateObj && toDateObj) {
        return i18n.t('dateFilter.range', {
            ns,
            from: fromDateObj.format(dateFmt),
            to: toDateObj.format(dateFmt),
        });
    }

    return i18n.t('dateFilter.label', { ns });
}
