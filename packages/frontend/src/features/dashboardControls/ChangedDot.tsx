import { Box } from '@mantine/core';
import { type FC } from 'react';
import classes from './FilterPills.module.css';

// What Save will keep: a rule or section that differs from the saved
// dashboard, on the top right corner of its pill or capsule
export const ChangedDot: FC = () => (
    <Box
        component="span"
        role="img"
        aria-label="Changed"
        className={classes.changedDot}
        data-corner
    />
);
