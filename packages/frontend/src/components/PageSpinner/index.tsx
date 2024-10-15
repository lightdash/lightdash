import { Box, Center, Loader, Overlay, rem } from '@mantine/core';
import { type FC } from 'react';
import Logo from '../../svgs/grey-icon-logo.svg?react';

const PageSpinner: FC = () => (
    <Center
        data-testid="page-spinner"
        pos="absolute"
        left={0}
        top={0}
        right={0}
        bottom={0}
    >
        <Box pos="relative" w={100} h={100}>
            <Loader
                color="gray.6"
                size={100}
                sx={{ g: { g: { strokeWidth: rem(2) } } }}
            />
            <Overlay component={Center} bg="transparent">
                <Logo width={rem(32)} height={rem(32)} />
            </Overlay>
        </Box>
    </Center>
);

export default PageSpinner;
