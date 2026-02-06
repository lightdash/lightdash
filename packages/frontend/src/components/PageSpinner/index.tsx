import { Center } from '@mantine-8/core';
import { type FC } from 'react';
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
        <div className={classes.shimmer} />
    </Center>
);

export default PageSpinner;
