import { type ApiAppVersionSummary } from '@lightdash/common';
import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type FC, type PropsWithChildren } from 'react';
import { fn } from 'storybook/test';
import AppVersionHistoryPanel from '../features/apps/components/AppVersionHistoryPanel';
import { appVersion } from '../features/apps/testing/appVersionHistory';
import { createQueryClient } from '../providers/ReactQuery/createQueryClient';

const storyQueryClient = createQueryClient();
const thumbnailSource = {
    projectUuid: 'project-uuid',
    appUuid: 'app-uuid',
};

/** A stand-in for a captured app: a header, two tiles and a chart. */
const thumbnailImage = (accent: string) =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
            <rect width="320" height="200" fill="#f8f9fa"/>
            <rect x="16" y="14" width="120" height="12" rx="3" fill="#ced4da"/>
            <rect x="16" y="40" width="136" height="44" rx="6" fill="#fff" stroke="#dee2e6"/>
            <rect x="168" y="40" width="136" height="44" rx="6" fill="#fff" stroke="#dee2e6"/>
            <rect x="16" y="98" width="288" height="88" rx="6" fill="#fff" stroke="#dee2e6"/>
            <path d="M32 168 L92 138 L152 150 L212 118 L288 128" fill="none" stroke="${accent}" stroke-width="4"/>
        </svg>`,
    )}`;

const THUMBNAIL_ACCENTS = ['#7262ff', '#12b886', '#fd7e14', '#228be6'];

/** Answers the version thumbnail read, which the story has no server for. */
const MockThumbnailRequests: FC<PropsWithChildren> = ({ children }) => {
    useEffect(() => {
        const originalFetch = window.fetch;
        window.fetch = async (input, init) => {
            const requestUrl =
                input instanceof Request ? input.url : input.toString();
            const match = requestUrl.match(
                /\/apps\/app-uuid\/versions\/(\d+)\/thumbnail/,
            );
            if (!match) return originalFetch(input, init);

            const version = Number(match[1]);
            return new Response(
                JSON.stringify({
                    status: 'ok',
                    results: {
                        thumbnailUrl: thumbnailImage(
                            THUMBNAIL_ACCENTS[
                                version % THUMBNAIL_ACCENTS.length
                            ],
                        ),
                    },
                }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, []);

    return <>{children}</>;
};

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
        thumbnailSource: null,
    },
    parameters: { layout: 'fullscreen' },
    decorators: [
        (renderStory) => (
            <MockThumbnailRequests>
                <QueryClientProvider client={storyQueryClient}>
                    <Box w={480} h="100vh">
                        {renderStory()}
                    </Box>
                </QueryClientProvider>
            </MockThumbnailRequests>
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

const withThumbnails = (
    versions: ApiAppVersionSummary[],
    versionsWithThumbnail: number[],
) =>
    versions.map((version) => ({
        ...version,
        hasThumbnail: versionsWithThumbnail.includes(version.version),
    }));

/** Every ready version has a thumbnail; the failed build has none. */
export const WithThumbnails: Story = {
    args: {
        versions: withThumbnails(
            [...thread1, ...thread2, ...thread3],
            [1, 2, 4, 5, 6, 7],
        ),
        thumbnailSource,
    },
};

/** Only some versions have one: the other rows and the failed build stay as they were. */
export const SomeWithThumbnails: Story = {
    args: {
        versions: withThumbnails(
            [...thread1, ...thread2, ...thread3],
            [4, 6, 7],
        ),
        thumbnailSource,
    },
};

/** Previewing an older version that has a thumbnail. */
export const ViewingOlderVersionWithThumbnails: Story = {
    args: {
        versions: withThumbnails(
            [...thread1, ...thread2, ...thread3],
            [2, 4, 6, 7],
        ),
        viewedVersion: 4,
        thumbnailSource,
    },
};

/** The rows stacked without the rail keep their thumbnails. */
export const WithThumbnailsWithoutTimeline: Story = {
    args: {
        versions: withThumbnails(thread1, [1, 2, 4]),
        latestReadyVersion: 4,
        showTimeline: false,
        thumbnailSource,
    },
};

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
