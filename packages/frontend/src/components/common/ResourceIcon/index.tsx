import {
    ChartKind,
    ResourceViewItemType,
    assertUnreachable,
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
    IconFolder,
    IconLayoutDashboard,
    type Icon as TablerIconType,
} from '@tabler/icons-react';
import { useRef, useState, type FC, type ReactNode } from 'react';
import { type StyledComponent } from 'styled-components';
import MantineIcon, { type MantineIconProps } from '../MantineIcon';
import { getChartIcon } from './utils';

interface ResourceIconProps {
    item: ResourceViewItem;
}

interface IconBoxProps extends MantineIconProps {
    color: string;
    bg?: string;
    icon: TablerIconType | StyledComponent<'svg', any, {}, never>;
}

export const IconBox: FC<IconBoxProps> = ({
    color,
    icon,
    size = 'lg',
    bg = 'ldGray.0',
    ...mantineIconProps
}) => (
    <Paper
        display="flex"
        component={Center}
        w={32}
        h={32}
        radius="md"
        bg={bg}
        sx={{
            flexGrow: 0,
            flexShrink: 0,
        }}
    >
        <MantineIcon
            icon={icon}
            color={color}
            fill={color}
            fillOpacity={0.1}
            size={size}
            strokeWidth={1.6}
            {...mantineIconProps}
        />
    </Paper>
);

export const ChartIcon: FC<{
    chartKind: ChartKind | undefined;
    color?: string;
}> = ({ chartKind, color }) => (
    <IconBox
        icon={getChartIcon(chartKind)}
        color={color ?? 'blue.6'}
        transform={
            chartKind === ChartKind.HORIZONTAL_BAR ? 'rotate(90)' : undefined
        }
    />
);

export const ResourceIcon: FC<ResourceIconProps> = ({ item }) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return <IconBox icon={IconLayoutDashboard} color="green.6" />;
        case ResourceViewItemType.SPACE:
            return <IconBox icon={IconFolder} color="violet.6" />;
        case ResourceViewItemType.CHART:
            return <ChartIcon chartKind={item.data.chartKind} />;
        default:
            return assertUnreachable(item, 'Resource type not supported');
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
