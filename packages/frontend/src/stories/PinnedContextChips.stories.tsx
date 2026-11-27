import { Box, Paper } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    fewPinnedItems,
    manyPinnedItems,
    pinnedDashboard,
} from './fixtures/pinnedContextData';
import { StatefulPinnedContextChips } from './fixtures/StatefulPinnedContextChips';

const meta: Meta<typeof StatefulPinnedContextChips> = {
    component: StatefulPinnedContextChips,
    title: 'AI Copilot/Pinned Context Chips',
    decorators: [
        (renderStory) => (
            // Room above for the list, at the docked chat's width.
            <Box pt={240} maw={380}>
                <Paper withBorder radius="md" p="sm">
                    {renderStory()}
                </Paper>
            </Box>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof StatefulPinnedContextChips>;

export const SingleItem: Story = {
    args: { initialItems: [pinnedDashboard] },
};

export const FewItems: Story = {
    args: { initialItems: fewPinnedItems },
};

/** More than three: the rest sit behind the count, which opens the list. */
export const Overflow: Story = {
    args: { initialItems: manyPinnedItems },
};
