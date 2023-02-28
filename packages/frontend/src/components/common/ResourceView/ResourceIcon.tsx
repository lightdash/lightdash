import { assertUnreachable, ChartKind } from '@lightdash/common';
import { Center, Paper, useMantineTheme } from '@mantine/core';
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
import { ResourceViewItem, ResourceViewItemType } from './resourceTypeUtils';

interface ResourceIconProps {
    item: ResourceViewItem;
}

const IconElements = {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconFolder,
    IconLayoutDashboard,
    IconSquareNumber1,
    IconTable,
} as const;

interface IconBoxProps {
    color: string;
    icon: keyof typeof IconElements;
    iconProps?: Parameters<typeof IconElements[keyof typeof IconElements]>[0];
}

const IconBox: FC<IconBoxProps> = ({ color, icon, iconProps }) => {
    const Icon = IconElements[icon];
    return (
        <Paper
            component={Center}
            w={30}
            h={30}
            shadow="sm"
            radius="sm"
            withBorder
            sx={{ flexGrow: 0, flexShrink: 0 }}
        >
            <Icon
                color={color}
                fill={color}
                fillOpacity={0.1}
                size={20}
                {...iconProps}
            />
        </Paper>
    );
};

const ResourceIcon: FC<ResourceIconProps> = ({ item }) => {
    const theme = useMantineTheme();

    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return (
                <IconBox
                    icon="IconLayoutDashboard"
                    color={theme.colors.green[8]}
                />
            );
        case ResourceViewItemType.SPACE:
            return <IconBox icon="IconFolder" color={theme.colors.violet[8]} />;
        case ResourceViewItemType.CHART:
            switch (item.data.chartType) {
                case undefined:
                case ChartKind.VERTICAL_BAR:
                    return (
                        <IconBox
                            icon="IconChartBar"
                            color={theme.colors.blue[8]}
                        />
                    );
                case ChartKind.HORIZONTAL_BAR:
                    return (
                        <IconBox
                            icon="IconChartBar"
                            color={theme.colors.blue[8]}
                            iconProps={{ style: { rotate: '90deg' } }}
                        />
                    );
                case ChartKind.LINE:
                    return (
                        <IconBox
                            icon="IconChartLine"
                            color={theme.colors.blue[8]}
                        />
                    );
                case ChartKind.SCATTER:
                    return (
                        <IconBox
                            icon="IconChartDots"
                            color={theme.colors.blue[8]}
                        />
                    );
                case ChartKind.AREA:
                    return (
                        <IconBox
                            icon="IconChartArea"
                            color={theme.colors.blue[8]}
                        />
                    );
                case ChartKind.MIXED:
                    return (
                        <IconBox
                            icon="IconChartAreaLine"
                            color={theme.colors.blue[8]}
                        />
                    );
                case ChartKind.TABLE:
                    return (
                        <IconBox
                            icon="IconTable"
                            color={theme.colors.blue[8]}
                        />
                    );
                case ChartKind.BIG_NUMBER:
                    return (
                        <IconBox
                            icon="IconSquareNumber1"
                            color={theme.colors.blue[8]}
                        />
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
