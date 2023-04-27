import {
    MantineColor,
    MantineNumberSize,
    useMantineTheme,
} from '@mantine/core';
import { TablerIconsProps } from '@tabler/icons-react';
import { forwardRef } from 'react';

export interface MantineIconProps extends TablerIconsProps {
    icon: (props: TablerIconsProps) => JSX.Element;
    size?: MantineNumberSize;
    stroke?: MantineNumberSize;
    color?: MantineColor;
    fill?: MantineColor;
}

const MantineIcon = forwardRef<SVGSVGElement, MantineIconProps>(
    ({ icon: TablerIcon, size = 'md', stroke, color, fill, ...rest }, ref) => {
        const theme = useMantineTheme();

        const mantineOverridedProps = {
            size: typeof size === 'string' ? theme.spacing[size] : size,
            stroke: typeof stroke === 'string' ? theme.spacing[stroke] : stroke,
            color: color ? theme.fn.themeColor(color) : undefined,
            fill: fill ? theme.fn.themeColor(fill) : 'none',
            display: 'block',
        };

        return <TablerIcon ref={ref} {...mantineOverridedProps} {...rest} />;
    },
);

export default MantineIcon;
