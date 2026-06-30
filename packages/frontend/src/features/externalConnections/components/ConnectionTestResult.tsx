import { type ExternalFetchResponse } from '@lightdash/common';
import { Badge, Code, Group, ScrollArea, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';

const MAX_BODY_RENDER_CHARS = 4000;

const statusColor = (status: number): string => {
    if (status < 300) return 'green';
    if (status < 500) return 'yellow';
    return 'red';
};

type Props = {
    response: ExternalFetchResponse;
};

/** Renders the result of a connection test: status badge, content type, and a
 *  truncated JSON preview of the response body. Shared by the onboarding wizard
 *  and the Edit modal's Examples tab. */
export const ConnectionTestResult: FC<Props> = ({ response }) => (
    <Stack gap="xs">
        <Group gap="xs">
            <Badge color={statusColor(response.status)}>
                {response.status}
            </Badge>
            <Text fz="xs" c="ldGray.6">
                {response.contentType}
            </Text>
            {response.truncated && <Badge color="yellow">truncated</Badge>}
        </Group>

        <ScrollArea.Autosize mah={260} offsetScrollbars>
            <Code block fz="xs">
                {JSON.stringify(response.body, null, 2).slice(
                    0,
                    MAX_BODY_RENDER_CHARS,
                )}
            </Code>
        </ScrollArea.Autosize>
    </Stack>
);
