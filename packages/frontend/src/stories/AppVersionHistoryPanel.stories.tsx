import { type ApiAppVersionSummary } from '@lightdash/common';
import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import AppVersionHistoryPanel from '../features/apps/components/AppVersionHistoryPanel';
import { appVersion } from '../features/apps/testing/appVersionHistory';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const entry = (
    version: number,
    threadNumber: number,
    prompt: string,
    overrides: Partial<ApiAppVersionSummary> = {},
): ApiAppVersionSummary => ({
    ...appVersion({
        version,
        prompt,
        createdAt: minutesAgo((8 - version) * 47),
        statusHistory: [],
        statusMessage: null,
        error: null,
    }),
    threadUuid: `thread-${threadNumber}`,
    threadNumber,
    ...overrides,
});

const thread1 = [
    entry(1, 1, 'a dashboard of weekly revenue by region'),
    entry(2, 1, 'add a totals row under the table'),
    entry(3, 1, 'make the chart a stacked bar', {
        status: 'error',
        statusMessage: 'The sandbox ran out of memory while bundling.',
    }),
    entry(4, 1, 'try the stacked bar again, keep the legend on the right'),
];

const thread2 = [
    entry(5, 2, ''),
    entry(6, 2, 'add a region filter to the header'),
];

const thread3 = [entry(7, 3, 'switch the palette to the brand colours')];

const meta: Meta<typeof AppVersionHistoryPanel> = {
    title: 'Data apps/Version history panel',
    component: AppVersionHistoryPanel,
    args: {
        versions: [...thread1, ...thread2, ...thread3],
        latestReadyVersion: 7,
        viewedVersion: null,
        onView: fn(),
        onRestore: fn(),
        onClose: null,
        onBack: fn(),
        liveBuild: null,
        hasEarlier: false,
        isFetchingEarlier: false,
        fetchEarlier: fn(),
        emptyPromptLabel: null,
        olderVersionTime: 'relative',
        showTimeline: true,
        currentThreadNumber: null,
    },
    parameters: { layout: 'fullscreen' },
    decorators: [
        (renderStory) => (
            <Box w={480} h="100vh">
                {renderStory()}
            </Box>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof AppVersionHistoryPanel>;

/** Three threads: a divider between each group, newest thread first. */
export const MultiThread: Story = {};

/** One thread, with a failed build: no divider. */
export const SingleThread: Story = {
    args: { versions: thread1, latestReadyVersion: 4 },
};

/** Context just cleared: the new thread has no versions, so the rule tops the list. */
export const FreshlyClearedThread: Story = {
    args: { versions: thread1, latestReadyVersion: 4, currentThreadNumber: 2 },
};

/** The same rows without the rail. */
export const WithoutTimeline: Story = {
    args: { showTimeline: false },
};

export const Empty: Story = {
    args: { versions: [], latestReadyVersion: null },
};

/** Previewing an older version: its Previewing button stays visible. */
export const ViewingOlderVersion: Story = { args: { viewedVersion: 4 } };

export const BuildInProgress: Story = {
    args: {
        liveBuild: { claimedVersion: 8, pendingPrompt: 'add a date picker' },
    },
};

export const LoadingEarlier: Story = {
    args: { hasEarlier: true, isFetchingEarlier: true },
};

/** How the chart type builder hosts it: collapse control, absolute times,
 *  a stand-in for empty prompts. */
export const ChartTypeBuilderHost: Story = {
    args: {
        onBack: null,
        onClose: fn(),
        emptyPromptLabel: 'Uploaded from source',
        olderVersionTime: 'absolute',
    },
};
