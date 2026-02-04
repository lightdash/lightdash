import { Box, Center, Loader, Overlay } from '@mantine-8/core';
import { type FC } from 'react';
import Logo from '../../svgs/grey-icon-logo.svg?react';
import classes from './PageSpinner.module.css';

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
            <Loader color="ldGray.5" size={100} className={classes.loader} />
            <Overlay component={Center} bg="transparent">
                <Logo width={48} height={48} />
            </Overlay>
        </Box>
    </Center>
);

export default PageSpinner;
