import {
    assertUnreachable,
    ChartKind,
    ChartSourceType,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import dayjs from 'dayjs';

export const getResourceTypeName = (item: ResourceViewItem) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return 'Dashboard';
        case ResourceViewItemType.SPACE:
            return 'Space';
        case ResourceViewItemType.CHART:
            switch (item.data.chartKind) {
                case undefined:
                case ChartKind.VERTICAL_BAR:
                    return 'Bar chart';
                case ChartKind.HORIZONTAL_BAR:
                    return 'Horizontal bar chart';
                case ChartKind.LINE:
                    return 'Line chart';
                case ChartKind.SCATTER:
                    return 'Scatter chart';
                case ChartKind.AREA:
                    return 'Area chart';
                case ChartKind.MIXED:
                    return 'Mixed chart';
                case ChartKind.PIE:
                    return 'Pie chart';
                case ChartKind.FUNNEL:
                    return 'Funnel chart';
                case ChartKind.TABLE:
                    return 'Table';
                case ChartKind.BIG_NUMBER:
                    return 'Big number';
                case ChartKind.CUSTOM:
                    return 'Custom visualization';
                default:
                    return assertUnreachable(
                        item.data.chartKind,
                        `Chart type ${item.data.chartKind} not supported`,
                    );
            }
        default:
            return assertUnreachable(item, 'Resource type not supported');
    }
};

export const getResourceUrl = (projectUuid: string, item: ResourceViewItem) => {
    const itemType = item.type;
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return `/projects/${projectUuid}/dashboards/${item.data.uuid}/view`;
        case ResourceViewItemType.CHART:
            if (item.data.source === ChartSourceType.SQL) {
                return `/projects/${projectUuid}/sql-runner-new/saved/${item.data.slug}`;
            }
            return `/projects/${projectUuid}/saved/${item.data.uuid}`;
        case ResourceViewItemType.SPACE:
            return `/projects/${projectUuid}/spaces/${item.data.uuid}`;
        default:
            return assertUnreachable(item, `Can't get URL for ${itemType}`);
    }
};

export const getResourceName = (type: ResourceViewItemType) => {
    switch (type) {
        case ResourceViewItemType.DASHBOARD:
            return 'Dashboard';
        case ResourceViewItemType.CHART:
            return 'Chart';
        case ResourceViewItemType.SPACE:
            return 'Space';
        default:
            return assertUnreachable(type, 'Resource type not supported');
    }
};

export const getResourceViewsSinceWhenDescription = (
    item: ResourceViewItem,
) => {
    if (
        item.type !== ResourceViewItemType.CHART &&
        item.type !== ResourceViewItemType.DASHBOARD
    ) {
        throw new Error('Only supported for charts and dashboards');
    }

    return item.data.firstViewedAt
        ? `${item.data.views} views since ${dayjs(
              item.data.firstViewedAt,
          ).format('MMM D, YYYY h:mm A')}`
        : undefined;
};
