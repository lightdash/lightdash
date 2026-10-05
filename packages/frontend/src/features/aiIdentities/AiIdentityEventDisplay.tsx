import { type AiIdentityEvent } from '@lightdash/common';
import { Box, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

dayjs.extend(relativeTime);

export const RelativeTime: FC<{ value: Date | string | null }> = ({ value }) =>
    value ? (
        <Tooltip label={new Date(value).toLocaleString()}>
            <Text fz="sm">{dayjs(value).fromNow()}</Text>
        </Tooltip>
    ) : (
        <Text fz="sm" c="dimmed">
            Never
        </Text>
    );

export const EventStatus: FC<{ event: AiIdentityEvent }> = ({ event }) => {
    const failed =
        event.status === 'error' ||
        (event.action === 'tested' && event.detail === 'failed');
    const label = `${failed ? 'Error' : 'Success'}${event.detail ? `: ${event.detail}` : ''}`;
    return (
        <Tooltip label={label} multiline maw={360}>
            <Box component="span" role="img" aria-label={label} tabIndex={0}>
                <MantineIcon
                    icon={failed ? IconX : IconCheck}
                    color={failed ? 'red' : 'green'}
                />
            </Box>
        </Tooltip>
    );
};
