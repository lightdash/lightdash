import { type ToolEditRepoOutput } from '@lightdash/common';
import { Anchor, Paper, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { summarisePrUrl } from './pullRequestCardUtils';

type Props = {
    metadata: ToolEditRepoOutput['metadata'];
};

export const AiEditRepoToolCall: FC<Props> = ({ metadata }) => {
    if (metadata.status === 'error') return null;

    return (
        <Paper p="sm" radius="md">
            <Stack gap="xs">
                <Text size="xs" fw={500}>
                    Edited repository
                </Text>
                {metadata.prUrl ? (
                    <Anchor
                        href={metadata.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        size="xs"
                    >
                        {metadata.repository ?? summarisePrUrl(metadata.prUrl)}
                    </Anchor>
                ) : (
                    <Text size="xs" c="dimmed">
                        No file changes were needed.
                    </Text>
                )}
            </Stack>
        </Paper>
    );
};
