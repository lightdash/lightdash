import { Box, type BoxProps } from '@mantine-8/core';
import React, { type ComponentType, type FC, type SVGProps } from 'react';
import classes from './BackgroundSvg.module.css';

type Props = BoxProps & {
    SvgComponent: ComponentType<SVGProps<SVGSVGElement>>;
};

export const BackgroundSvg: FC<React.PropsWithChildren<Props>> = ({
    SvgComponent,
    children,
    ...props
}) => (
    <Box pos="relative" {...props}>
        <Box className={classes.overlay}>
            <SvgComponent width="100%" height="100%" />
        </Box>
        <Box className={classes.content}>{children}</Box>
    </Box>
);
