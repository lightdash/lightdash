import {
    assertUnreachable,
    ChartKind,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import {
    Center,
    Indicator,
    Paper,
    Tooltip,
    type IndicatorProps,
    type TooltipProps,
} from '@mantine/core';
import {
    IconChartArea,
    IconChartBar,
    IconChartDots,
    IconChartHistogram,
    IconChartLine,
    IconChartPie,
    IconCode,
    IconFolder,
    IconLayoutDashboard,
    IconSquareNumber1,
    IconTable,
    type Icon as TablerIconType,
} from '@tabler/icons-react';
import { useRef, useState, type FC, type ReactNode } from 'react';
import { type StyledComponent } from 'styled-components';
import MantineIcon, { type MantineIconProps } from '../MantineIcon';

interface ResourceIconProps {
    item: ResourceViewItem;
}

interface IconBoxProps extends MantineIconProps {
    color: string;
    icon: TablerIconType | StyledComponent<'svg', any, {}, never>;
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

export const getChartIcon = (chartKind: ChartKind | undefined) => {
    switch (chartKind) {
        case undefined:
        case ChartKind.VERTICAL_BAR:
            return IconChartBar;
        case ChartKind.HORIZONTAL_BAR:
            return IconChartBar;
        case ChartKind.LINE:
            return IconChartLine;
        case ChartKind.SCATTER:
            return IconChartDots;
        case ChartKind.AREA:
            return IconChartArea;
        case ChartKind.MIXED:
            return IconChartHistogram;
        case ChartKind.PIE:
            return IconChartPie;
        case ChartKind.TABLE:
            return IconTable;
        case ChartKind.BIG_NUMBER:
            return IconSquareNumber1;
        case ChartKind.CUSTOM:
            return IconCode;
        default:
            return assertUnreachable(
                chartKind,
                `Chart type ${chartKind} not supported`,
            );
    }
};

export const ChartIcon: FC<{
    chartKind: ChartKind | undefined;
    color?: string;
}> = ({ chartKind, color = 'blue.8' }) => (
    <IconBox
        icon={getChartIcon(chartKind)}
        color={color}
        transform={
            chartKind === ChartKind.HORIZONTAL_BAR ? 'rotate(90)' : undefined
        }
    />
);

export const ResourceIcon: FC<ResourceIconProps> = ({ item }) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return <IconBox icon={IconLayoutDashboard} color="green.8" />;
        case ResourceViewItemType.SPACE:
            return <IconBox icon={IconFolder} color="violet.8" />;
        case ResourceViewItemType.CHART:
            return <ChartIcon chartKind={item.data.chartKind} />;
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
    React.PropsWithChildren<
        {
            tooltipLabel: ReactNode;
            iconProps: MantineIconProps;
            tooltipProps: Partial<TooltipProps>;
        } & Pick<IndicatorProps, 'disabled'>
    >
> = ({ disabled, tooltipLabel, iconProps, tooltipProps, children }) => {
    // NOTE: Control the Tooltip visibility manually to allow hovering on Label.
    const [opened, setOpened] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const closeTimeoutId = useRef<number | undefined>(undefined);

    const handleMouseEnter = () => {
        clearTimeout(closeTimeoutId.current);
        setOpened(true);
    };

    const handleMouseLeave = () => {
        // NOTE: Provide similar delay as Tooltip component
        closeTimeoutId.current = window.setTimeout(() => {
            setOpened(false);
        }, 100);
    };

    const handleLabelMouseEnter = () => {
        setIsHovering(true);
        clearTimeout(closeTimeoutId.current);
    };

    const handleLabelMouseLeave = () => {
        setIsHovering(false);
        // NOTE: Provide similar delay as Tooltip component
        closeTimeoutId.current = window.setTimeout(() => {
            setOpened(false);
        }, 100);
    };

    return (
        <Indicator
            disabled={disabled}
            position="bottom-end"
            color="transparent"
            label={
                <Tooltip
                    {...tooltipProps}
                    sx={{ pointerEvents: 'auto' }}
                    label={
                        <div
                            onMouseEnter={handleLabelMouseEnter}
                            onMouseLeave={handleLabelMouseLeave}
                        >
                            {tooltipLabel}
                        </div>
                    }
                    opened={opened || isHovering}
                >
                    <MantineIcon
                        icon={iconProps.icon}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                        style={{
                            color: iconProps.color, // NOTE: If react-tabler icon is filled, then we have to override the color this way
                        }}
                    />
                </Tooltip>
            }
        >
            {children}
        </Indicator>
    );
};
