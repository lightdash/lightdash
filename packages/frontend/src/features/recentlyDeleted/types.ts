import type { ContentType } from '@lightdash/common';

/** Custom chart types share ContentType.DATA_APP, split via dataAppVizsFilter. */
export const CHART_TYPES_FILTER_VALUE = 'chartTypes' as const;

export type DeletedContentTypeFilter =
    | 'all'
    | ContentType.CHART
    | ContentType.DASHBOARD
    | ContentType.SPACE
    | ContentType.DATA_APP
    | typeof CHART_TYPES_FILTER_VALUE;
