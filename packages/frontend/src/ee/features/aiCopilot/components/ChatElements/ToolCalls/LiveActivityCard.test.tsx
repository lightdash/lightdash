import { QuerySourceType } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../../../../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { store } from '../../../store';
import {
    LiveActivityCard,
    type LiveActivityToolGroup,
} from './LiveActivityCard';

vi.mock('../../../../../../api');

const buildComposerToolGroups = (
    toolName: 'query' | 'runComposerQueries',
): LiveActivityToolGroup[] => [
    {
        keyId: 'composer-call',
        toolName,
        calls: [
            {
                toolCallId: 'composer-call',
                toolName,
                toolArgs: {
                    title: 'Compare targets',
                    description: null,
                    terminalNodeId: null,
                    queries: [
                        {
                            sourceType: QuerySourceType.EXTERNAL,
                            nodeId: 'targets',
                            title: 'Revenue targets',
                            description: null,
                            sql: 'select * from targets_csv',
                            tables: ['targets_csv'],
                            limit: 500,
                        },
                    ],
                },
            },
        ],
    },
];

const composerToolGroups = buildComposerToolGroups('runComposerQueries');

describe.each(['query', 'runComposerQueries'] as const)(
    'LiveActivityCard composer queries (%s)',
    (toolName) => {
        const composerToolGroups = buildComposerToolGroups(toolName);
        const runningTargets = [
            {
                message: 'Running "targets"',
                toolName,
                progressId: 'composer-call:targets',
                progressStatus: 'in_progress' as const,
            },
        ];

        it('keeps the running node SQL collapsed while the query is running', async () => {
            renderWithProviders(
                <LiveActivityCard
                    isLive
                    toolGroups={composerToolGroups}
                    stepProgressMessages={runningTargets}
                />,
            );

            await waitFor(() =>
                expect(screen.getByText('External data')).toBeVisible(),
            );
            expect(
                screen.getByRole('button', { name: /Revenue targets/ }),
            ).toHaveAttribute('aria-expanded', 'false');
        });

        it('collapses the steps once the run finishes', async () => {
            const { rerender } = renderWithProviders(
                <LiveActivityCard
                    isLive
                    toolGroups={composerToolGroups}
                    stepProgressMessages={runningTargets}
                />,
            );
            await waitFor(() =>
                expect(screen.getByText('External data')).toBeVisible(),
            );

            rerender(
                <LiveActivityCard
                    isLive={false}
                    toolGroups={composerToolGroups}
                />,
            );

            await waitFor(() =>
                expect(
                    screen.getByRole('button', { expanded: false }),
                ).toBeVisible(),
            );
            expect(screen.queryByText('External data')).not.toBeVisible();
        });

        it('starts collapsed for a finished run', () => {
            renderWithProviders(
                <LiveActivityCard
                    isLive={false}
                    toolGroups={composerToolGroups}
                />,
            );
            expect(
                screen.getByRole('button', { expanded: false }),
            ).toBeVisible();
            expect(screen.queryByText('External data')).not.toBeVisible();
        });
    },
);

describe('LiveActivityCard composer failure', () => {
    it('shows no status on a node when the call errors while it was running', () => {
        const failedGroups: LiveActivityToolGroup[] = [
            {
                ...composerToolGroups[0],
                calls: [
                    {
                        ...composerToolGroups[0].calls[0],
                        isPreliminary: false,
                        toolOutput: {
                            result: 'Composer query failed: missing column',
                            metadata: { status: 'error' },
                        },
                    },
                ],
            },
        ];
        renderWithProviders(
            <LiveActivityCard
                isLive
                toolGroups={failedGroups}
                stepProgressMessages={[
                    {
                        message: 'Running query "targets"...',
                        toolName: 'runComposerQueries',
                        progressId: 'composer-call:targets',
                        progressStatus: 'in_progress',
                    },
                ]}
            />,
        );

        expect(screen.queryByLabelText('Failed')).not.toBeInTheDocument();
        const failedRow = screen
            .getAllByRole('button', { expanded: false })
            .find((row) => row.textContent?.includes('Revenue targets'));
        expect(failedRow).toBeDefined();
    });
});

describe('LiveActivityCard composer submission failure', () => {
    it('shows no failed status when the call errors before any node starts', () => {
        const failedGroups: LiveActivityToolGroup[] = [
            {
                ...composerToolGroups[0],
                calls: [
                    {
                        ...composerToolGroups[0].calls[0],
                        isPreliminary: false,
                        toolOutput: {
                            result: 'Error running composer queries.',
                            metadata: { status: 'error' },
                        },
                    },
                ],
            },
        ];
        renderWithProviders(
            <LiveActivityCard isLive toolGroups={failedGroups} />,
        );

        expect(screen.getByText('Revenue targets')).toBeInTheDocument();
        expect(screen.queryByLabelText('Failed')).not.toBeInTheDocument();
    });
});

describe('LiveActivityCard composer approval', () => {
    const sqlPipeline: LiveActivityToolGroup[] = [
        {
            keyId: 'composer-approval',
            toolName: 'runComposerQueries',
            calls: [
                {
                    toolCallId: 'composer-approval',
                    toolName: 'runComposerQueries',
                    toolArgs: {
                        title: 'Payments',
                        description: null,
                        terminalNodeId: null,
                        queries: [
                            {
                                sourceType: QuerySourceType.SQL,
                                nodeId: 'payments',
                                title: 'Average payments',
                                description: null,
                                sql: 'select avg(amount) from payments',
                                limit: 500,
                            },
                        ],
                    },
                },
            ],
        },
    ];

    it('shows inline approval even when the card is not live', () => {
        renderWithProviders(
            <Provider store={store}>
                <LiveActivityCard
                    isLive={false}
                    toolGroups={sqlPipeline}
                    approval={{
                        projectUuid: 'project',
                        agentUuid: 'agent',
                        threadUuid: 'thread',
                        pendingToolCallIds: ['composer-approval'],
                        decidedToolCallIds: [],
                    }}
                />
            </Provider>,
        );

        expect(screen.getByLabelText('Awaiting approval')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
    });
});

describe('LiveActivityCard runSql', () => {
    const sqlToolGroups: LiveActivityToolGroup[] = [
        {
            keyId: 'sql-call',
            toolName: 'runSql',
            calls: [
                {
                    toolCallId: 'sql-call',
                    toolName: 'runSql',
                    toolArgs: { sql: 'select 1 as one', limit: 10 },
                },
            ],
        },
    ];

    it('stays expanded after the run finishes', () => {
        renderWithProviders(
            <LiveActivityCard isLive={false} toolGroups={sqlToolGroups} />,
        );
        expect(screen.getByRole('button', { expanded: true })).toBeVisible();
    });

    it('renders the approval inline under the SQL with an awaiting status', () => {
        renderWithProviders(
            <Provider store={store}>
                <LiveActivityCard
                    isLive={false}
                    toolGroups={sqlToolGroups}
                    approval={{
                        projectUuid: 'project',
                        agentUuid: 'agent',
                        threadUuid: 'thread',
                        pendingToolCallIds: ['sql-call'],
                        decidedToolCallIds: [],
                    }}
                />
            </Provider>,
        );
        expect(screen.getByText('awaiting approval')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Reject' })).toBeVisible();
    });

    it('collapses once the approval is decided', () => {
        const approval = {
            projectUuid: 'project',
            agentUuid: 'agent',
            threadUuid: 'thread',
        };
        const { rerender } = renderWithProviders(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={sqlToolGroups}
                    approval={{
                        ...approval,
                        pendingToolCallIds: ['sql-call'],
                        decidedToolCallIds: [],
                    }}
                />
            </Provider>,
        );
        expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();

        rerender(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={sqlToolGroups}
                    approval={{
                        ...approval,
                        pendingToolCallIds: [],
                        decidedToolCallIds: ['sql-call'],
                    }}
                />
            </Provider>,
        );
        expect(
            screen.getByRole('button', { name: /Running SQL query/ }),
        ).toHaveAttribute('aria-expanded', 'false');
    });

    it('keeps a group that streams in as the approval clears expanded', () => {
        const approval = {
            projectUuid: 'project',
            agentUuid: 'agent',
            threadUuid: 'thread',
        };
        const nextGroup: LiveActivityToolGroup = {
            keyId: 'sql-call-2',
            toolName: 'runSql',
            calls: [
                {
                    toolCallId: 'sql-call-2',
                    toolName: 'runSql',
                    toolArgs: { sql: 'select 2 as two', limit: 10 },
                },
            ],
        };
        const { rerender } = renderWithProviders(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={sqlToolGroups}
                    approval={{
                        ...approval,
                        pendingToolCallIds: ['sql-call'],
                        decidedToolCallIds: [],
                    }}
                />
            </Provider>,
        );

        rerender(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={[...sqlToolGroups, nextGroup]}
                    approval={{
                        ...approval,
                        pendingToolCallIds: [],
                        decidedToolCallIds: ['sql-call'],
                    }}
                />
            </Provider>,
        );
        expect(
            screen.getByRole('button', { name: /Running SQL query/ }),
        ).toHaveAttribute('aria-expanded', 'true');
    });

    it('keeps a user collapse when the stream ends', async () => {
        const { rerender } = renderWithProviders(
            <LiveActivityCard isLive toolGroups={sqlToolGroups} />,
        );
        await userEvent.click(screen.getByRole('button', { expanded: true }));
        expect(screen.getByRole('button', { expanded: false })).toBeVisible();

        rerender(
            <LiveActivityCard isLive={false} toolGroups={sqlToolGroups} />,
        );
        expect(screen.getByRole('button', { expanded: false })).toBeVisible();
    });
});

describe('LiveActivityCard approval behind a later call', () => {
    const thread = {
        projectUuid: 'project',
        agentUuid: 'agent',
        threadUuid: 'thread',
    };
    const sqlGroup = (id: string, sql: string): LiveActivityToolGroup => ({
        keyId: id,
        toolName: 'runSql',
        calls: [{ toolCallId: id, toolName: 'runSql', toolArgs: { sql } }],
    });
    const chartRun: LiveActivityToolGroup = {
        keyId: 'chart-run',
        toolName: 'runContentQuery',
        calls: [
            {
                toolCallId: 'chart-run',
                toolName: 'runContentQuery',
                toolArgs: {
                    source: { type: 'chart', chartSlug: 'revenue' },
                },
            },
        ],
    };
    const composerEdit: LiveActivityToolGroup = {
        keyId: 'composer-edit',
        toolName: 'editContent',
        calls: [
            {
                toolCallId: 'composer-edit',
                toolName: 'editContent',
                toolArgs: {
                    type: 'composer_chart',
                    slug: 'payments',
                    patch: [
                        {
                            op: 'replace',
                            path: '/pipeline/nodes/0/sql',
                            value: 'select 1',
                        },
                    ],
                },
            },
        ],
    };

    afterEach(() => {
        window.sessionStorage.clear();
        mockedLightdashApi.mockReset();
    });

    it('keeps the approval of an edit followed by a chart run in the same step', () => {
        renderWithProviders(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={[composerEdit, chartRun]}
                    approval={{
                        ...thread,
                        pendingToolCallIds: ['composer-edit'],
                        decidedToolCallIds: [],
                    }}
                />
            </Provider>,
        );

        expect(screen.getByText('awaiting approval')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Reject' })).toBeVisible();
        expect(screen.queryByText(/^Edited/)).not.toBeInTheDocument();
    });

    it('sends each decision for two approvals pending in one step', async () => {
        mockedLightdashApi.mockResolvedValue(undefined);
        renderWithProviders(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={[
                        sqlGroup('first', 'select 1'),
                        chartRun,
                        sqlGroup('second', 'select 2'),
                    ]}
                    approval={{
                        ...thread,
                        pendingToolCallIds: ['first', 'second'],
                        decidedToolCallIds: [],
                    }}
                />
            </Provider>,
        );

        const approveButtons = screen.getAllByRole('button', {
            name: 'Approve',
        });
        expect(approveButtons).toHaveLength(2);
        await userEvent.click(approveButtons[0]);
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Reject' })[1],
        );

        await waitFor(() =>
            expect(mockedLightdashApi).toHaveBeenCalledTimes(2),
        );
        expect(mockedLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/aiAgents/agent/threads/thread/tool-calls/first/sql-approval',
                body: JSON.stringify({ decision: 'approved' }),
            }),
        );
        expect(mockedLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/aiAgents/agent/threads/thread/tool-calls/second/sql-approval',
                body: JSON.stringify({ decision: 'rejected' }),
            }),
        );
    });

    it('keeps a decision in flight when the newer approval resolves first', async () => {
        mockedLightdashApi.mockReturnValue(new Promise(() => undefined));
        const toolGroups = [
            sqlGroup('first', 'select 1'),
            chartRun,
            sqlGroup('second', 'select 2'),
        ];
        const { rerender } = renderWithProviders(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={toolGroups}
                    approval={{
                        ...thread,
                        pendingToolCallIds: ['first', 'second'],
                        decidedToolCallIds: [],
                    }}
                />
            </Provider>,
        );
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Approve' })[0],
        );

        rerender(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={toolGroups}
                    approval={{
                        ...thread,
                        pendingToolCallIds: ['first'],
                        decidedToolCallIds: ['second'],
                    }}
                />
            </Provider>,
        );

        expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    });

    it('shows a chart run behind a pending edit as still running', async () => {
        const toolGroups = [composerEdit, chartRun];
        const { rerender, container } = renderWithProviders(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={toolGroups}
                    approval={{
                        ...thread,
                        pendingToolCallIds: [],
                        decidedToolCallIds: [],
                    }}
                />
            </Provider>,
        );
        await userEvent.click(screen.getByRole('button', { expanded: false }));

        rerender(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={toolGroups}
                    approval={{
                        ...thread,
                        pendingToolCallIds: ['composer-edit'],
                        decidedToolCallIds: [],
                    }}
                />
            </Provider>,
        );

        expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
        expect(container.querySelector('[data-status="done"]')).toBeNull();
        expect(
            container.querySelector('[data-status="running"]'),
        ).not.toBeNull();
    });

    it('collapses once the edit is decided and the turn ends', () => {
        const toolGroups = [composerEdit, chartRun];
        const { rerender } = renderWithProviders(
            <Provider store={store}>
                <LiveActivityCard
                    isLive
                    toolGroups={toolGroups}
                    approval={{
                        ...thread,
                        pendingToolCallIds: ['composer-edit'],
                        decidedToolCallIds: [],
                    }}
                />
            </Provider>,
        );
        expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();

        rerender(
            <Provider store={store}>
                <LiveActivityCard
                    isLive={false}
                    toolGroups={toolGroups}
                    approval={{
                        ...thread,
                        pendingToolCallIds: [],
                        decidedToolCallIds: ['composer-edit'],
                    }}
                />
            </Provider>,
        );

        expect(screen.getByRole('button', { expanded: false })).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Approve' }),
        ).not.toBeInTheDocument();
    });
});

describe('LiveActivityCard reasoning', () => {
    const reasoning = { texts: ['Checking the orders model'], isLive: false };

    it('renders reasoning alone when there are no tool groups', () => {
        renderWithProviders(
            <LiveActivityCard
                isLive={false}
                toolGroups={[]}
                reasoning={reasoning}
            />,
        );
        expect(screen.getByText('Reasoning')).toBeVisible();
    });

    it('renders nothing without tool groups or reasoning', () => {
        renderWithProviders(
            <LiveActivityCard
                isLive={false}
                toolGroups={[]}
                reasoning={{ texts: [], isLive: false }}
            />,
        );
        expect(screen.queryByText('Reasoning')).toBeNull();
    });

    it('renders reasoning as the first item of the card body', async () => {
        renderWithProviders(
            <LiveActivityCard
                isLive={false}
                toolGroups={composerToolGroups}
                reasoning={reasoning}
            />,
        );
        expect(screen.getByText('Reasoning')).not.toBeVisible();

        await userEvent.click(screen.getAllByRole('button')[0]);

        const reasoningRow = screen.getByText('Reasoning');
        await waitFor(() => expect(reasoningRow).toBeVisible());
        // First control after the card header is the reasoning row.
        expect(screen.getAllByRole('button')[1]).toContainElement(reasoningRow);
    });
});

describe('LiveActivityCard step status', () => {
    const sqlGroup = (
        call: Partial<LiveActivityToolGroup['calls'][number]>,
    ): LiveActivityToolGroup[] => [
        {
            keyId: 'sql-call',
            toolName: 'runSql',
            calls: [
                {
                    toolCallId: 'sql-call',
                    toolName: 'runSql',
                    toolArgs: { sql: 'select 1' },
                    ...call,
                },
            ],
        },
    ];

    it('counts a single finished step like any other turn', () => {
        renderWithProviders(
            <LiveActivityCard
                isLive={false}
                toolGroups={[
                    {
                        keyId: 'app-call',
                        toolName: 'generateDataApp',
                        calls: [
                            {
                                toolCallId: 'app-call',
                                toolName: 'generateDataApp',
                                toolArgs: {},
                            },
                        ],
                    },
                ]}
            />,
        );
        expect(screen.getByText('Steps taken')).toBeInTheDocument();
        expect(screen.getByText('1 step')).toBeInTheDocument();
    });

    // A failed step reads like a finished one: the agent recovers on its own.
    it.each(['success', 'error'])(
        'keeps a %s latest step in the present tense while streaming',
        (status) => {
            renderWithProviders(
                <LiveActivityCard
                    isLive
                    toolGroups={sqlGroup({
                        toolOutput: { result: '', metadata: { status } },
                        isPreliminary: false,
                    })}
                />,
            );
            expect(screen.getByText('Running SQL query')).toBeInTheDocument();
            expect(screen.queryByText('Ran SQL query')).not.toBeInTheDocument();
        },
    );
});

describe('LiveActivityCard failed composer run', () => {
    const queries = ['a', 'b', 'c'].map((nodeId) => ({
        sourceType: QuerySourceType.EXTERNAL,
        nodeId,
        title: `Node ${nodeId}`,
        description: null,
        sql: 'select 1',
        tables: ['t'],
        limit: 500,
    }));
    const failedRun: LiveActivityToolGroup[] = [
        {
            keyId: 'composer-call',
            toolName: 'runComposerQueries',
            calls: [
                {
                    toolCallId: 'composer-call',
                    toolName: 'runComposerQueries',
                    toolArgs: {
                        title: 'Compare',
                        description: null,
                        terminalNodeId: 'c',
                        queries,
                    },
                    isPreliminary: false,
                    toolOutput: {
                        result: 'Composer query failed',
                        metadata: { status: 'error' },
                    },
                },
            ],
        },
    ];

    it('stays quiet while the agent retries a failed query', () => {
        renderWithProviders(
            <LiveActivityCard
                isLive
                toolGroups={failedRun}
                stepProgressMessages={['a', 'b'].map((nodeId) => ({
                    message: `Ran ${nodeId}`,
                    toolName: 'runComposerQueries',
                    progressId: `composer-call:${nodeId}`,
                    progressStatus: 'complete' as const,
                }))}
            />,
        );
        expect(screen.queryByText('Failed')).not.toBeInTheDocument();
        expect(screen.getByText('2 of 3 queries')).toBeInTheDocument();
    });

    it('neither counts a failed query nor claims a chart was built', () => {
        renderWithProviders(
            <LiveActivityCard isLive={false} toolGroups={failedRun} />,
        );
        expect(screen.queryByText('1 step failed')).not.toBeInTheDocument();
        expect(
            screen.queryByText('How this chart was built'),
        ).not.toBeInTheDocument();
    });
});

describe('LiveActivityCard composer progress', () => {
    it('counts queries once instead of also badging the call count', () => {
        const call = (nodeId: string) => ({
            toolCallId: `call-${nodeId}`,
            toolName: 'runComposerQueries',
            toolArgs: {
                title: null,
                description: null,
                terminalNodeId: null,
                queries: [
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId,
                        title: nodeId,
                        description: null,
                        sql: 'select 1',
                        limit: 500,
                    },
                ],
            },
        });
        renderWithProviders(
            <LiveActivityCard
                isLive
                toolGroups={[
                    {
                        keyId: 'composer',
                        toolName: 'runComposerQueries',
                        calls: [call('a'), call('b')],
                    },
                ]}
                stepProgressMessages={[
                    {
                        message: 'Ran a',
                        toolName: 'runComposerQueries',
                        progressId: 'call-a:a',
                        progressStatus: 'complete',
                    },
                ]}
            />,
        );
        expect(screen.getByText('1 of 2 queries')).toBeInTheDocument();
        expect(
            screen.queryByText('2', { exact: true }),
        ).not.toBeInTheDocument();
    });
});

describe('LiveActivityCard composer dependencies', () => {
    const groups: LiveActivityToolGroup[] = [
        {
            keyId: 'composer',
            toolName: 'runComposerQueries',
            calls: [
                {
                    toolCallId: 'call',
                    toolName: 'runComposerQueries',
                    toolArgs: {
                        title: null,
                        description: null,
                        terminalNodeId: 'totals',
                        queries: [
                            {
                                sourceType: QuerySourceType.SQL,
                                nodeId: 'orders',
                                title: 'Orders',
                                description: null,
                                sql: 'select 1',
                                limit: 500,
                            },
                            {
                                sourceType: QuerySourceType.DUCKDB,
                                nodeId: 'totals',
                                title: 'Totals',
                                description: null,
                                sql: 'select * from orders',
                                references: ['orders'],
                                limit: 500,
                            },
                        ],
                    },
                },
            ],
        },
    ];
    const running = (nodeId: string) => ({
        message: `Running ${nodeId}`,
        toolName: 'runComposerQueries',
        progressId: `call:${nodeId}`,
        progressStatus: 'in_progress' as const,
    });

    it('queues a node until the results it reads finish', () => {
        renderWithProviders(
            <LiveActivityCard
                isLive
                toolGroups={groups}
                stepProgressMessages={[running('orders'), running('totals')]}
            />,
        );
        expect(screen.getAllByLabelText('Running')).toHaveLength(1);
        expect(screen.getAllByLabelText('Queued')).toHaveLength(1);
    });

    it('runs the node once its inputs are done', () => {
        renderWithProviders(
            <LiveActivityCard
                isLive
                toolGroups={groups}
                stepProgressMessages={[
                    running('orders'),
                    running('totals'),
                    { ...running('orders'), progressStatus: 'complete' },
                ]}
            />,
        );
        expect(screen.getAllByLabelText('Running')).toHaveLength(1);
        expect(screen.queryByLabelText('Queued')).not.toBeInTheDocument();
    });
});
