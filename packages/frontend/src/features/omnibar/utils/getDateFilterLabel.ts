import { type SearchFilters } from '@lightdash/common';
import dayjs from 'dayjs';

export function getDateFilterLabel(filters: SearchFilters = {}) {
    const { fromDate, toDate } = filters;
    const fromDateObj = fromDate ? dayjs(fromDate) : undefined;
    const toDateObj = toDate ? dayjs(toDate) : undefined;
    const dateFmt = 'YYYY-MM-DD';

    if (fromDateObj && !toDateObj) {
        return `From ${fromDateObj.format(dateFmt)}`;
    }

    if (!fromDateObj && toDateObj) {
        return `To ${toDateObj.format(dateFmt)}`;
    }

    if (fromDateObj?.isSame(toDateObj, 'day')) {
        return fromDateObj?.format(dateFmt);
    }

    if (fromDateObj && toDateObj) {
        return `From ${fromDateObj.format(dateFmt)} to ${toDateObj.format(
            dateFmt,
        )}`;
    }

    return 'Date';
}
