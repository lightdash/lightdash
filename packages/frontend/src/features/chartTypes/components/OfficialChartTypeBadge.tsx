import { Tooltip } from '@mantine/core';
import { type FC } from 'react';
import Bolt from '../../../svgs/grey-icon-logo.svg?react';
import classes from './OfficialChartTypeBadge.module.css';

/** Marks a chart type installed from the official chart registry. */
const OfficialChartTypeBadge: FC = () => (
    <Tooltip label="Built by Lightdash" withinPortal>
        <span
            className={classes.bolt}
            role="img"
            aria-label="Built by Lightdash"
        >
            <Bolt />
        </span>
    </Tooltip>
);

export default OfficialChartTypeBadge;
