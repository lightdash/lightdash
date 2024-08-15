import {
    useMantineTheme,
    type MantineColor,
    type MantineNumberSize,
} from '@mantine/core';
import {
    type Icon as TablerIconType,
    type TablerIconsProps,
} from '@tabler/icons-react';
import { forwardRef } from 'react';

export interface MantineIconProps extends Omit<TablerIconsProps, 'ref'> {
    icon: TablerIconType;
    size?: MantineNumberSize;
    stroke?: MantineNumberSize;
    color?: MantineColor;
    fill?: MantineColor;
}

const MantineIcon = forwardRef<SVGSVGElement, MantineIconProps>(
    ({ icon: TablerIcon, size = 'md', stroke, color, fill, ...rest }, ref) => {
        const theme = useMantineTheme();

        const mantineOverridedProps: TablerIconsProps = {
            size: typeof size === 'string' ? theme.spacing[size] : size,
            stroke: typeof stroke === 'string' ? theme.spacing[stroke] : stroke,
            color: color ? theme.colors[color] : color,
            fill: fill ? theme.colors[fill] : 'none',
            display: 'block',
        };

        return <TablerIcon ref={ref} {...mantineOverridedProps} {...rest} />;
    },
);

export default MantineIcon;
