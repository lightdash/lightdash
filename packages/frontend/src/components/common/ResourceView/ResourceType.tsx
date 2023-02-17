import { assertUnreachable, ChartKind } from '@lightdash/common';
import { FC } from 'react';
import { ResourceViewItem, ResourceViewItemType } from './ResourceTypeUtils';

interface ResourceTypeProps {
    item: ResourceViewItem;
}

const ResourceType: FC<ResourceTypeProps> = ({ item }) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return <>Dashboard</>;
        case ResourceViewItemType.SPACE:
            return <>Space</>;
        case ResourceViewItemType.CHART:
            switch (item.data.chartType) {
                case undefined:
                case ChartKind.VERTICAL_BAR:
                    return <>Bar chart</>;
                case ChartKind.HORIZONTAL_BAR:
                    return <>Horizontal bar chart</>;
                case ChartKind.LINE:
                    return <>Line chart</>;
                case ChartKind.SCATTER:
                    return <>Scatter chart</>;
                case ChartKind.AREA:
                    return <>Area chart</>;
                case ChartKind.MIXED:
                    return <>Mixed chart</>;
                case ChartKind.TABLE:
                    return <>Table</>;
                case ChartKind.BIG_NUMBER:
                    return <>Big number</>;
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

export default ResourceType;
