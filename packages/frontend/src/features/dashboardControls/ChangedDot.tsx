import { Box } from '@mantine/core';
import { type FC } from 'react';
import classes from './FilterPills.module.css';

// What Save will keep: a rule or section that differs from the saved
// dashboard. On a pill it sits on the corner, on a capsule after its name
export const ChangedDot: FC<{ isCorner: boolean }> = ({ isCorner }) => (
    <Box
        component="span"
        role="img"
        aria-label="Changed"
        className={classes.changedDot}
        data-corner={isCorner || undefined}
    />
);
