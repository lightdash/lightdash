import { Group, Paper, Text } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import ClearAgentContextButton from '../features/apps/components/ClearAgentContextButton';

const meta: Meta<typeof ClearAgentContextButton> = {
    title: 'Data apps/Clear agent context button',
    component: ClearAgentContextButton,
    args: { disabled: false, onClick: fn() },
    decorators: [
        (renderStory) => (
            <Paper w={480} p="md">
                <Group justify="space-between">
                    <Text fz="sm" c="dimmed">
                        Chat box toolbar
                    </Text>
                    {renderStory()}
                </Group>
            </Paper>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof ClearAgentContextButton>;

/** Hover for the two-line tooltip. */
export const Default: Story = {};

/** While a build runs; the tooltip still explains the control. */
export const Disabled: Story = { args: { disabled: true } };
