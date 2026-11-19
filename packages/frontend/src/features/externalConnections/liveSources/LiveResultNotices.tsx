import { type LiveResultNotice } from '@lightdash/common';
import { Alert, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/**
 * What a live data source result leaves out or counts its own way, such as
 * rows past the integration's cap or a default date window. The server
 * writes each message, so the panel and the AI agent say the same thing.
 */
export const LiveResultNotices: FC<{
    notices: LiveResultNotice[] | undefined;
}> = ({ notices }) => {
    if (!notices || notices.length === 0) return null;
    return (
        <Alert
            color="yellow"
            py={6}
            radius={0}
            icon={<MantineIcon icon={IconInfoCircle} />}
            data-testid="live-result-notices"
        >
            <Stack gap={2}>
                {notices.map((notice) => (
                    <Text key={notice.type} fz="xs">
                        {notice.message}
                    </Text>
                ))}
            </Stack>
        </Alert>
    );
};
