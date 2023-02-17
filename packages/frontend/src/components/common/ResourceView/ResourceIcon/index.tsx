import { Colors } from '@blueprintjs/core';
import { assertUnreachable, ChartKind } from '@lightdash/common';
import {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconFolder,
    IconLayoutDashboard,
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';
import { FC } from 'react';
import { ResourceListItem, ResourceViewItemType } from '../ResourceTypeUtils';
import { ResourceIconBox } from './ResourceIcon.styles';

interface ResourceIconProps {
    item: ResourceListItem;
}

const ResourceIcon: FC<ResourceIconProps> = ({ item }) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return (
                <ResourceIconBox color={Colors.GREEN3}>
                    <IconLayoutDashboard color={Colors.GREEN3} size={20} />
                </ResourceIconBox>
            );
        case ResourceViewItemType.SPACE:
            return (
                <ResourceIconBox color={Colors.VIOLET3}>
                    <IconFolder color={Colors.VIOLET3} size={20} />
                </ResourceIconBox>
            );
        case ResourceViewItemType.CHART:
            switch (item.data.chartType) {
                case undefined:
                case ChartKind.VERTICAL_BAR:
                    return (
                        <ResourceIconBox color={Colors.BLUE3}>
                            <IconChartBar color={Colors.BLUE3} size={20} />
                        </ResourceIconBox>
                    );
                case ChartKind.HORIZONTAL_BAR:
                    return (
                        <ResourceIconBox color={Colors.BLUE3}>
                            <IconChartBar
                                color={Colors.BLUE3}
                                size={20}
                                style={{ rotate: '90deg' }}
                            />
                        </ResourceIconBox>
                    );
                case ChartKind.LINE:
                    return (
                        <ResourceIconBox color={Colors.BLUE3}>
                            <IconChartLine color={Colors.BLUE3} size={20} />
                        </ResourceIconBox>
                    );
                case ChartKind.SCATTER:
                    return (
                        <ResourceIconBox color={Colors.BLUE3}>
                            <IconChartDots color={Colors.BLUE3} size={20} />
                        </ResourceIconBox>
                    );
                case ChartKind.AREA:
                    return (
                        <ResourceIconBox color={Colors.BLUE3}>
                            <IconChartArea color={Colors.BLUE3} size={20} />
                        </ResourceIconBox>
                    );
                case ChartKind.MIXED:
                    return (
                        <ResourceIconBox color={Colors.BLUE3}>
                            <IconChartAreaLine color={Colors.BLUE3} size={20} />
                        </ResourceIconBox>
                    );
                case ChartKind.TABLE:
                    return (
                        <ResourceIconBox color={Colors.BLUE3}>
                            <IconTable color={Colors.BLUE3} size={20} />
                        </ResourceIconBox>
                    );
                case ChartKind.BIG_NUMBER:
                    return (
                        <ResourceIconBox color={Colors.BLUE3}>
                            <IconSquareNumber1 color={Colors.BLUE3} size={20} />
                        </ResourceIconBox>
                    );
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

export default ResourceIcon;
