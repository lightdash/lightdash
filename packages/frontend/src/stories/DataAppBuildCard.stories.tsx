import { Box, Stack } from '@mantine/core';
import '@mantine/core/styles.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
    DataAppBuildCard,
    type DataAppBuildCardState,
} from '../ee/features/aiCopilot/components/ChatElements/DataAppBuildCard/DataAppBuildCard';
import MantineBaseProvider from '../providers/MantineBaseProvider';

const APP_NAME = 'Weekly revenue by region';

const states = {
    queued: { kind: 'queued' },
    building: {
        kind: 'building',
        statusMessage: 'Building your app',
        narration: {
            reasoning: [
                'Totals should reconcile against the existing revenue metric, so every page reads from the semantic layer.',
            ],
            activity: ['Ran 5 queries · 26 weeks · 4 regions'],
        },
    },
    ready: {
        kind: 'ready',
        name: APP_NAME,
        version: 1,
        durationMs: 372_000,
        completionMessage:
            'Your app is ready. Five regional pages, weekly revenue over the last 26 weeks.',
    },
    failed: {
        kind: 'failed',
        message:
            'The build failed while generating your app. Nothing was published.',
    },
    cancelled: { kind: 'cancelled' },
    unavailable: { kind: 'unavailable' },
} satisfies Record<string, DataAppBuildCardState>;

const meta: Meta<typeof DataAppBuildCard> = {
    title: 'AI Copilot/DataAppBuildCard',
    component: DataAppBuildCard,
    args: {
        compact: false,
        onOpenBuilder: fn(),
        onView: fn(),
    },
    decorators: [
        (renderStory) => (
            <MantineBaseProvider>
                <Stack w={720} p="md">
                    {renderStory()}
                </Stack>
            </MantineBaseProvider>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof DataAppBuildCard>;

export const Queued: Story = { args: { state: states.queued } };

export const Building: Story = { args: { state: states.building } };

export const Ready: Story = { args: { state: states.ready } };

export const ReadyWithoutDuration: Story = {
    args: { state: { ...states.ready, version: 3, durationMs: null } },
};

export const Failed: Story = { args: { state: states.failed } };

export const Cancelled: Story = { args: { state: states.cancelled } };

export const Unavailable: Story = { args: { state: states.unavailable } };

export const CompactReady: Story = {
    args: { state: states.ready, compact: true },
};

export const CompactFailed: Story = {
    args: { state: states.failed, compact: true },
};

/** Every state at a phone-width column; nothing should overflow. */
export const MobileWidth: Story = {
    render: (args) => (
        <Box w={320}>
            <Stack gap="sm">
                {Object.values(states).map((state) => (
                    <DataAppBuildCard
                        key={state.kind}
                        {...args}
                        state={state}
                    />
                ))}
                <DataAppBuildCard {...args} state={states.ready} compact />
                <DataAppBuildCard {...args} state={states.failed} compact />
            </Stack>
        </Box>
    ),
};
