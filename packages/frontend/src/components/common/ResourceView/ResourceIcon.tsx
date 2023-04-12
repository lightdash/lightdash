import {
    assertUnreachable,
    ChartKind,
    ResourceViewItem,
    ResourceViewItemType,
} from '@lightdash/common';
import { Center, Paper } from '@mantine/core';
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
    TablerIconsProps,
} from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../MantineIcon';

interface ResourceIconProps {
    item: ResourceViewItem;
}

interface IconBoxProps extends TablerIconsProps {
    color: string;
    icon: (props: TablerIconsProps) => JSX.Element;
}

const IconBox: FC<IconBoxProps> = ({
    color,
    icon,
    size = 'xl',
    ...tablerIconProps
}) => (
    <Paper
        display="flex"
        component={Center}
        w={32}
        h={32}
        withBorder
        radius="sm"
        shadow="sm"
        sx={{ flexGrow: 0, flexShrink: 0 }}
    >
        <MantineIcon
            icon={icon}
            color={color}
            fill={color}
            fillOpacity={0.1}
            {...tablerIconProps}
        />
    </Paper>
);

const ResourceIcon: FC<ResourceIconProps> = ({ item }) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return <IconBox icon={IconLayoutDashboard} color="green.8" />;
        case ResourceViewItemType.SPACE:
            return <IconBox icon={IconFolder} color="violet.8" />;
        case ResourceViewItemType.CHART:
            switch (item.data.chartType) {
                case undefined:
                case ChartKind.VERTICAL_BAR:
                    return <IconBox icon={IconChartBar} color="blue.8" />;
                case ChartKind.HORIZONTAL_BAR:
                    return (
                        <IconBox
                            icon={IconChartBar}
                            color="blue.8"
                            style={{ rotate: '90deg' }}
                        />
                    );
                case ChartKind.LINE:
                    return <IconBox icon={IconChartLine} color="blue.8" />;
                case ChartKind.SCATTER:
                    return <IconBox icon={IconChartDots} color="blue.8" />;
                case ChartKind.AREA:
                    return <IconBox icon={IconChartArea} color="blue.8" />;
                case ChartKind.MIXED:
                    return <IconBox icon={IconChartAreaLine} color="blue.8" />;
                case ChartKind.TABLE:
                    return <IconBox icon={IconTable} color="blue.8" />;
                case ChartKind.BIG_NUMBER:
                    return <IconBox icon={IconSquareNumber1} color="blue.8" />;
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

interface ResourceTypeIconProps {
    type: ResourceViewItemType;
}

const COMMON_ICON_PROPS = {
    size: 'xl',
    fillOpacity: 0.1,
};

const ResourceTypeIcon: FC<ResourceTypeIconProps> = ({ type }) => {
    switch (type) {
        case ResourceViewItemType.DASHBOARD:
            return (
                <MantineIcon
                    icon={IconLayoutDashboard}
                    {...COMMON_ICON_PROPS}
                    fill="green.8"
                    color="green.8"
                />
            );
        case ResourceViewItemType.SPACE:
            return (
                <MantineIcon
                    icon={IconFolder}
                    {...COMMON_ICON_PROPS}
                    fill="violet.8"
                    color="violet.8"
                />
            );
        case ResourceViewItemType.CHART:
            return (
                <MantineIcon
                    icon={IconChartBar}
                    {...COMMON_ICON_PROPS}
                    fill="blue.8"
                    color="blue.8"
                />
            );
        default:
            return assertUnreachable(type, 'Resource type not supported');
    }
};

export { ResourceIcon, ResourceTypeIcon };
