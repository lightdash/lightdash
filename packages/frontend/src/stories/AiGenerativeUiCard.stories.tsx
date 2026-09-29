import {
    type GenerativeUiActionSubmission,
    type ToolGenerateUiMetadata,
} from '@lightdash/common';
import {
    deleteWithConfirmSpecMock,
    dependentQuerySpecMock,
    everyBlockSpecMock,
    forEachChainSpecMock,
    GENERATIVE_UI_PROJECT_UUID_MOCK,
    generativeUiOperationsMock,
    invalidSpecMock,
    moveChartsOutcomesMock,
    moveChartsSpecMock,
    staticRowsSpecMock,
} from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import { Box, Code, Stack } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import { GenerativeUiCard } from '../ee/features/aiCopilot/components/ChatElements/GenerativeUi/GenerativeUiCard';
import { GenerativeUiResolvedView } from '../ee/features/aiCopilot/components/ChatElements/GenerativeUi/GenerativeUiResolvedView';
import {
    type GenerativeUiFetcher,
    type GenerativeUiRequest,
} from '../ee/features/aiCopilot/components/ChatElements/GenerativeUi/requests';
import { createQueryClient } from '../providers/ReactQuery/createQueryClient';

const SPACES = [
    { uuid: 'space-finance', name: 'Finance' },
    { uuid: 'space-sales', name: 'Sales' },
    { uuid: 'space-empty', name: 'Old experiments' },
];

const CHARTS = [
    {
        uuid: 'chart-revenue-month',
        name: 'Revenue by month',
        spaceName: 'Sales',
    },
    {
        uuid: 'chart-revenue-region',
        name: 'Revenue by region',
        spaceName: 'Sales',
    },
    { uuid: 'chart-revenue-plan', name: 'Revenue vs plan', spaceName: 'Sales' },
    { uuid: 'chart-orders', name: 'Orders by week', spaceName: 'Operations' },
];

const DASHBOARDS = [
    { uuid: 'dashboard-weekly', name: 'Weekly revenue' },
    { uuid: 'dashboard-ops', name: 'Operations overview' },
];

const SCHEDULERS: Record<
    string,
    { schedulerUuid: string; name: string; cron: string }[]
> = {
    'dashboard-weekly': [
        {
            schedulerUuid: 'scheduler-monday',
            name: 'Monday digest',
            cron: '0 9 * * 1',
        },
        {
            schedulerUuid: 'scheduler-friday',
            name: 'Friday wrap-up',
            cron: '0 16 * * 5',
        },
    ],
    'dashboard-ops': [],
};

const EXPLORES = [
    { label: 'Orders', groupLabel: 'Sales' },
    { label: 'Customers', groupLabel: 'Sales' },
    { label: 'Shipments', groupLabel: 'Operations' },
];

const forbidden = {
    status: 'error',
    error: {
        name: 'ForbiddenError',
        statusCode: 403,
        message: "You don't have access to this chart",
        data: {},
    },
};

const delay = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

const readResponse = ({ method, url }: GenerativeUiRequest): unknown => {
    const [path] = url.split('?');
    if (method === 'POST' && path.endsWith('/spaces')) {
        return { uuid: 'space-new', name: 'New space' };
    }
    if (method !== 'GET') return null;
    if (path.endsWith('/spaces')) return SPACES;
    if (path.endsWith('/chart-summaries')) return CHARTS;
    if (path.endsWith('/dashboards')) return DASHBOARDS;
    if (path.endsWith('/explores')) return EXPLORES;
    const dashboardUuid = /^\/dashboards\/([^/]+)\/schedulers$/.exec(path)?.[1];
    return dashboardUuid === undefined
        ? []
        : { data: SCHEDULERS[decodeURIComponent(dashboardUuid)] ?? [] };
};

/** Answers like the API after a short delay; failOnWrite rejects that write (1-based). */
const storyFetcher = (failOnWrite: number | null): GenerativeUiFetcher => {
    let writes = 0;
    return async (request) => {
        await delay(400);
        if (request.method !== 'GET') {
            writes += 1;
            if (writes === failOnWrite) return Promise.reject(forbidden);
        }
        return readResponse(request);
    };
};

type CardHarnessProps = {
    toolArgs: unknown;
    failOnWrite: number | null;
    waiting: boolean;
};

/** The card with a fake API; the submitted outcome prints below it. */
const CardHarness: FC<CardHarnessProps> = ({
    toolArgs,
    failOnWrite,
    waiting,
}) => {
    const [queryClient] = useState(() => createQueryClient());
    const [fetcher] = useState(() => storyFetcher(failOnWrite));
    const [submission, setSubmission] =
        useState<GenerativeUiActionSubmission | null>(null);

    return (
        <QueryClientProvider client={queryClient}>
            <Box maw={560} p="xl">
                <Stack gap="md">
                    <GenerativeUiCard
                        toolCallId="story-tool-call"
                        projectUuid={GENERATIVE_UI_PROJECT_UUID_MOCK}
                        toolArgs={toolArgs}
                        operations={generativeUiOperationsMock}
                        waiting={waiting}
                        fetcher={fetcher}
                        onSubmit={async (next) => {
                            await delay(300);
                            setSubmission(next);
                            return { kind: 'sent' };
                        }}
                    />
                    {submission === null ? null : (
                        <Code block>{JSON.stringify(submission, null, 2)}</Code>
                    )}
                </Stack>
            </Box>
        </QueryClientProvider>
    );
};

const meta: Meta<typeof CardHarness> = {
    title: 'AI Agent/Generative UI card',
    component: CardHarness,
    parameters: { layout: 'fullscreen' },
    args: { failOnWrite: null, waiting: false },
};

export default meta;

type Story = StoryObj<typeof CardHarness>;

export const MoveCharts: Story = { args: { toolArgs: moveChartsSpecMock } };

export const EveryBlock: Story = { args: { toolArgs: everyBlockSpecMock } };

export const DependentQuery: Story = {
    args: { toolArgs: dependentQuerySpecMock },
};

export const ForEachChain: Story = {
    args: { toolArgs: forEachChainSpecMock },
};

export const DeleteWithConfirm: Story = {
    args: { toolArgs: deleteWithConfirmSpecMock },
};

export const StaticRows: Story = { args: { toolArgs: staticRowsSpecMock } };

/** The second move is rejected, so the card reports a failed outcome. */
export const FailedStep: Story = {
    args: { toolArgs: moveChartsSpecMock, failOnWrite: 2 },
};

export const InvalidSpec: Story = { args: { toolArgs: invalidSpecMock } };

/** A run for the message is still in flight, so the form is locked. */
export const Waiting: Story = {
    args: { toolArgs: moveChartsSpecMock, waiting: true },
};

const ResolvedHarness: FC<{ metadata: ToolGenerateUiMetadata }> = ({
    metadata,
}) => (
    <Box maw={560} p="xl">
        <GenerativeUiResolvedView
            toolArgs={moveChartsSpecMock}
            metadata={metadata}
        />
    </Box>
);

export const ResolvedDone: Story = {
    render: () => (
        <ResolvedHarness
            metadata={{
                status: 'success',
                state: moveChartsOutcomesMock.success.state,
            }}
        />
    ),
};

export const ResolvedFailed: Story = {
    render: () => (
        <ResolvedHarness
            metadata={{
                status: 'failed',
                state: moveChartsOutcomesMock.failed.state,
            }}
        />
    ),
};

export const ResolvedSkipped: Story = {
    render: () => (
        <ResolvedHarness
            metadata={{
                status: 'dismissed',
                state: moveChartsOutcomesMock.dismissed.state,
            }}
        />
    ),
};
