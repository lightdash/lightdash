import {
    assertUnreachable,
    ContentType,
    type ChartKind,
} from '@lightdash/common';
import {
    IconAppWindow,
    IconLayoutDashboard,
    type Icon,
} from '@tabler/icons-react';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';

export const getContentMentionIcon = (
    contentType:
        | ContentType.CHART
        | ContentType.DASHBOARD
        | ContentType.DATA_APP,
    chartKind: ChartKind | null,
): { icon: Icon; color: string } => {
    switch (contentType) {
        case ContentType.DASHBOARD:
            return { icon: IconLayoutDashboard, color: 'green.7' };
        case ContentType.DATA_APP:
            return { icon: IconAppWindow, color: 'orange.6' };
        case ContentType.CHART:
            return {
                icon: getChartIcon(chartKind ?? undefined),
                color: 'blue.7',
            };
        default:
            return assertUnreachable(
                contentType,
                'Unknown content mention type',
            );
    }
};
