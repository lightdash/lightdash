import { Box } from '@mantine/core';
import { type FC } from 'react';
import classes from './RunningBar.module.css';

type Props = {
    /** What is in progress, for assistive tech */
    label: string;
};

/**
 * Indeterminate progress: a short bar sweeping left to right along the top
 * edge of whatever it is placed in. Takes up no layout space.
 */
const RunningBar: FC<Props> = ({ label }) => (
    <Box className={classes.bar} role="progressbar" aria-label={label} />
);

export default RunningBar;
