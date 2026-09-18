import { Box, Paper, Stack, Text } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import ThreadDivider from '../features/apps/components/ThreadDivider';

const Bubble = ({ children }: { children: string }) => (
    <Paper p="sm" maw={360}>
        <Text fz="sm">{children}</Text>
    </Paper>
);

const meta: Meta<typeof ThreadDivider> = {
    title: 'Data apps/Thread divider',
    component: ThreadDivider,
    args: { fromVersion: 12 },
    decorators: [
        (renderStory) => (
            <Stack w={640} p="md" gap="sm">
                <Box ml="auto">
                    <Bubble>make the totals row bold</Bubble>
                </Box>
                <Bubble>Done, the totals row is bold in v12.</Bubble>
                {renderStory()}
                <Box ml="auto">
                    <Bubble>add a filter by region</Bubble>
                </Box>
            </Stack>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof ThreadDivider>;

export const Default: Story = {};

/** Cleared right after the first version. */
export const FromFirstVersion: Story = { args: { fromVersion: 1 } };

/** Alone in an emptied chat, before the next prompt. */
export const EmptyChat: Story = {
    decorators: [
        (renderStory) => (
            <Stack w={640} p="md">
                {renderStory()}
            </Stack>
        ),
    ],
};
