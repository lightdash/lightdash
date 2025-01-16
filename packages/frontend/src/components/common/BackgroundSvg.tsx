import { Box, type BoxProps } from '@mantine/core';
import { type ComponentType, type FC, type SVGProps } from 'react';

type Props = BoxProps & {
    SvgComponent: ComponentType<SVGProps<SVGSVGElement>>;
};

export const BackgroundSvg: FC<Props> = ({
    SvgComponent,
    children,
    ...props
}) => (
    <Box pos="relative" {...props}>
        <Box
            sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 0,
            }}
        >
            <SvgComponent width="100%" height="100%" />
        </Box>
        <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
    </Box>
);
