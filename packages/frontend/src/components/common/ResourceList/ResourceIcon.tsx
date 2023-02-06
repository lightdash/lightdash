import { Colors } from '@blueprintjs/core';
import { assertUnreachable, ChartKind } from '@lightdash/common';
import {
    Icon123,
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { FC } from 'react';
import { ResourceIconBox } from './ResourceIcon.styles';
import { ResourceListItem, ResourceListType } from './ResourceTypeUtils';

interface ResourceIconProps {
    item: ResourceListItem;
}

const ResourceIcon: FC<ResourceIconProps> = ({ item }) => {
    switch (item.type) {
        case ResourceListType.DASHBOARD:
            return (
                <ResourceIconBox color={Colors.GREEN3}>
                    <IconLayoutDashboard color={Colors.GREEN3} size={20} />
                </ResourceIconBox>
            );
        case ResourceListType.CHART:
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
                            <Icon123 color={Colors.BLUE3} size={20} />
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
