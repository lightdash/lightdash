import { assertUnreachable, ChartKind } from '@lightdash/common';
import { ResourceViewItem, ResourceViewItemType } from './resourceTypeUtils';

export const getResourceTypeName = (item: ResourceViewItem) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return 'Dashboard';
        case ResourceViewItemType.SPACE:
            return 'Space';
        case ResourceViewItemType.CHART:
            switch (item.data.chartType) {
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
                case ChartKind.TABLE:
                    return 'Table';
                case ChartKind.BIG_NUMBER:
                    return 'Big number';
                default:
                    return assertUnreachable(
                        item.data.chartType,
                        `Chart type ${item.data.chartType} not supported`,
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
            return `/projects/${projectUuid}/saved/${item.data.uuid}`;
        case ResourceViewItemType.SPACE:
            return `/projects/${projectUuid}/spaces/${item.data.uuid}`;
        default:
            return assertUnreachable(item, `Can't get URL for ${itemType}`);
    }
};
