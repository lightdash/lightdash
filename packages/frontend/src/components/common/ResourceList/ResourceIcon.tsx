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
import { AcceptedResources } from '.';
import { ResourceIconBox } from './ResourceIcon.styles';

interface ResourceIconProps {
    resource: AcceptedResources;
    resourceType: 'chart' | 'dashboard';
}

const ResourceIcon: FC<ResourceIconProps> = ({ resource, resourceType }) => {
    switch (resourceType) {
        case 'dashboard':
            return (
                <ResourceIconBox color={Colors.BLUE5}>
                    <IconLayoutDashboard color={Colors.BLUE3} />
                </ResourceIconBox>
            );
        case 'chart':
            switch ((resource as SpaceQuery).chartType) {
                case ChartKind.LINE:
                    return (
                        <ResourceIconBox color={Colors.GREEN3}>
                            <IconChartLine color={Colors.GREEN3} />
                        </ResourceIconBox>
                    );
                case ChartKind.BAR:
                    return (
                        <ResourceIconBox color={Colors.GREEN3}>
                            <IconChartBar color={Colors.GREEN3} />
                        </ResourceIconBox>
                    );
                case ChartKind.SCATTER:
                    return (
                        <ResourceIconBox color={Colors.GREEN3}>
                            <IconChartDots color={Colors.GREEN3} />
                        </ResourceIconBox>
                    );
                case ChartKind.AREA:
                    return (
                        <ResourceIconBox color={Colors.GREEN3}>
                            <IconChartArea color={Colors.GREEN3} />
                        </ResourceIconBox>
                    );
                case ChartKind.MIXED:
                    return (
                        <ResourceIconBox color={Colors.GREEN3}>
                            <IconChartAreaLine color={Colors.GREEN3} />
                        </ResourceIconBox>
                    );
                case ChartKind.TABLE:
                    return (
                        <ResourceIconBox color={Colors.GREEN3}>
                            <IconTable color={Colors.GREEN3} />
                        </ResourceIconBox>
                    );
                case ChartKind.BIG_NUMBER:
                    return (
                        <ResourceIconBox color={Colors.GREEN3}>
                            <Icon123 color={Colors.GREEN3} />
                        </ResourceIconBox>
                    );
                default:
                    return null;
            }
        default:
            return assertUnreachable(
                resourceType,
                'Resource type not supported',
            );
    }
};

export default ResourceIcon;
