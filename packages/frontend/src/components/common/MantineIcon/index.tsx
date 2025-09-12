import {
    parseThemeColor,
    useMantineTheme,
    type MantineColor,
    type MantineSize,
} from '@mantine-8/core';
import {
    type Icon as TablerIconType,
    type TablerIconsProps,
} from '@tabler/icons-react';
import { forwardRef } from 'react';

export interface MantineIconProps extends Omit<TablerIconsProps, 'ref'> {
    icon: TablerIconType;
    size?: MantineSize | number | string;
    stroke?: number;
    color?: MantineColor;
    fill?: MantineColor;
}

const MantineIcon = forwardRef<SVGSVGElement, MantineIconProps>(
    ({ icon: TablerIcon, size = 'md', stroke, color, fill, ...rest }, ref) => {
        const theme = useMantineTheme();

        const getSize = () => {
            if (typeof size === 'number') return size;
            const sizeMap: Record<string, number> = {
                xs: 12,
                sm: 14,
                md: 18,
                lg: 26,
                xl: 32,
                xxl: 40,
            };
            return sizeMap[size as string] || 18;
        };

        const mantineOverridedProps: TablerIconsProps = {
            size: getSize(),
            stroke: stroke || undefined,
            color: color ? parseThemeColor({ color, theme }).value : undefined,
            fill: fill ? parseThemeColor({ color: fill, theme }).value : 'none',
            display: 'block',
        };

        return <TablerIcon ref={ref} {...mantineOverridedProps} {...rest} />;
    },
);

export default MantineIcon;
