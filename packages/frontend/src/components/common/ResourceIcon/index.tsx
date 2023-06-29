import {
    assertUnreachable,
    ChartKind,
    ResourceViewItem,
    ResourceViewItemType,
} from '@lightdash/common';
import {
    Center,
    Indicator,
    IndicatorProps,
    Paper,
    Tooltip,
    TooltipProps,
} from '@mantine/core';
import {
    Icon as TablerIconType,
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconChartPie,
    IconFolder,
    IconLayoutDashboard,
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';
import { FC, ReactNode } from 'react';
import { useTooltipControlOpen } from '../../../hooks/tooltip/useTooltipControlOpen';
import MantineIcon, { MantineIconProps } from '../MantineIcon';

interface ResourceIconProps {
    item: ResourceViewItem;
}

interface IconBoxProps extends MantineIconProps {
    color: string;
    icon: TablerIconType;
}

export const IconBox: FC<IconBoxProps> = ({
    color,
    icon,
    size = 'lg',
    ...mantineIconProps
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
            size={size}
            {...mantineIconProps}
        />
    </Paper>
);

export const getChartIcon = (chartType: ChartKind | undefined) => {
    switch (chartType) {
        case undefined:
        case ChartKind.VERTICAL_BAR:
            return <IconBox icon={IconChartBar} color="blue.8" />;
        case ChartKind.HORIZONTAL_BAR:
            return (
                <IconBox
                    icon={IconChartBar}
                    color="blue.8"
                    transform="rotate(90)"
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
        case ChartKind.PIE:
            return <IconBox icon={IconChartPie} color="blue.8" />;
        case ChartKind.TABLE:
            return <IconBox icon={IconTable} color="blue.8" />;
        case ChartKind.BIG_NUMBER:
            return <IconBox icon={IconSquareNumber1} color="blue.8" />;
        default:
            return assertUnreachable(
                chartType,
                `Chart type ${chartType} not supported`,
            );
    }
};

export const ResourceIcon: FC<ResourceIconProps> = ({ item }) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return <IconBox icon={IconLayoutDashboard} color="green.8" />;
        case ResourceViewItemType.SPACE:
            return <IconBox icon={IconFolder} color="violet.8" />;
        case ResourceViewItemType.CHART:
            return getChartIcon(item.data.chartType);
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

export const ResourceTypeIcon: FC<ResourceTypeIconProps> = ({ type }) => {
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

export const ResourceIndicator: FC<
    {
        children: ReactNode;
        tooltipLabel: ReactNode;
        iconProps: MantineIconProps;
        tooltipProps: Partial<TooltipProps>;
    } & Pick<IndicatorProps, 'disabled'>
> = ({ disabled, tooltipLabel, iconProps, tooltipProps, children }) => {
    const {
        tooltipProps: { sx, isOpen, handleMouseEnter, handleMouseLeave },
        tooltipLabelProps: { handleLabelMouseEnter, handleLabelMouseLeave },
    } = useTooltipControlOpen();

    return (
        <Indicator
            disabled={disabled}
            position="bottom-end"
            color="transparent"
            label={
                <Tooltip
                    sx={sx}
                    label={
                        <div
                            onMouseEnter={handleLabelMouseEnter}
                            onMouseLeave={handleLabelMouseLeave}
                        >
                            {tooltipLabel}
                        </div>
                    }
                    opened={isOpen}
                    {...tooltipProps}
                >
                    <MantineIcon
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                        {...iconProps}
                    />
                </Tooltip>
            }
        >
            {children}
        </Indicator>
    );
};
