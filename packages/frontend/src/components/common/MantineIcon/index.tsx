import {
    MantineColor,
    MantineNumberSize,
    useMantineTheme,
} from '@mantine/core';
import { TablerIconsProps } from '@tabler/icons-react';
import { FC } from 'react';

interface MantineIconProps extends TablerIconsProps {
    icon: (props: TablerIconsProps) => JSX.Element;
    size?: MantineNumberSize;
    stroke?: MantineNumberSize;
    color?: MantineColor;
    fill?: MantineColor;
}

const MantineIcon: FC<MantineIconProps> = ({
    icon: TablerIcon,
    size = 'lg',
    stroke,
    color,
    fill,
    ...rest
}) => {
    const theme = useMantineTheme();

    const mantineOverridedProps = {
        size: typeof size === 'string' ? theme.spacing[size] : size,
        stroke: typeof stroke === 'string' ? theme.spacing[stroke] : stroke,
        color: color ? theme.fn.themeColor(color) : undefined,
        fill: fill ? theme.fn.themeColor(fill) : 'none',
    };

    return <TablerIcon {...mantineOverridedProps} {...rest} />;
};

export default MantineIcon;
