import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { StudioDraftIllustration } from '../../../../../features/semanticStudio/StudioDraftIllustration';

/** What the chat shows before a conversation starts. */
export const StudioChatEmptyState: FC<{ keepsDraft: boolean }> = ({
    keepsDraft,
}) => (
    <Stack flex={1} justify="center" align="center" gap="md" px="md">
        <StudioDraftIllustration />
        <Stack gap={2} align="center" maw={280}>
            <Text fz="sm" fw={600}>
                Draft changes by asking
            </Text>
            <Text fz="xs" c="dimmed" ta="center">
                {keepsDraft
                    ? 'Only you see a draft until you publish it.'
                    : 'Nothing is published until you publish the draft.'}
            </Text>
        </Stack>
    </Stack>
);
