import {
    assertUnreachable,
    ContentType,
    type ChartKind,
} from '@lightdash/common';
import { type Icon } from '@tabler/icons-react';
import {
    DashboardIcon,
    DataAppIcon,
} from '../../../../../components/common/ContentIcons';
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
            return { icon: DashboardIcon, color: 'green.7' };
        case ContentType.DATA_APP:
            return { icon: DataAppIcon, color: 'orange.6' };
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
