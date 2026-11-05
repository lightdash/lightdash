import { formatTimestamp, TimeFrames } from '@lightdash/common';
import { Text, Tooltip } from '@mantine/core';
import classes from './ConnectionTimestamp.module.css';
import { formatConnectionTimestamp } from './formatConnectionTimestamp';

export const ConnectionTimestamp = ({ value }: { value: string }) => {
    const full = formatTimestamp(value, TimeFrames.MINUTE);
    return (
        <Tooltip
            label={full}
            events={{ hover: true, focus: true, touch: false }}
        >
            <Text
                component="time"
                dateTime={value}
                span
                inherit
                tabIndex={0}
                aria-label={full}
                className={classes.date}
            >
                {formatConnectionTimestamp(value)}
            </Text>
        </Tooltip>
    );
};
