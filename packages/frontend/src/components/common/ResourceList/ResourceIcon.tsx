import { Colors } from '@blueprintjs/core';
import { assertUnreachable, ChartKind, SpaceQuery } from '@lightdash/common';
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
import { AcceptedResources, AcceptedResourceTypes } from './ResourceTypeUtils';

interface ResourceIconProps {
    resource: AcceptedResources;
    resourceType: AcceptedResourceTypes;
}

const ResourceIcon: FC<ResourceIconProps> = ({ resource, resourceType }) => {
    switch (resourceType) {
        case 'dashboard':
            return (
                <ResourceIconBox color={Colors.GREEN3}>
                    <IconLayoutDashboard color={Colors.GREEN3} size={20} />
                </ResourceIconBox>
            );
        case 'chart':
            const chartType = (resource as SpaceQuery).chartType;
            switch (chartType) {
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
                        chartType,
                        `Chart type ${chartType} not supported`,
                    );
            }
        default:
            return assertUnreachable(
                resourceType,
                'Resource type not supported',
            );
    }
};

export default ResourceIcon;
