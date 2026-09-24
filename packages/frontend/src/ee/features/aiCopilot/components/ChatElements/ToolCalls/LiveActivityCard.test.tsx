import { QuerySourceType } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { store } from '../../../store';
import {
    LiveActivityCard,
    type LiveActivityToolGroup,
} from './LiveActivityCard';

const composerToolGroups: LiveActivityToolGroup[] = [
    {
        keyId: 'composer-call',
        toolName: 'runComposerQueries',
        calls: [
            {
                toolCallId: 'composer-call',
                toolName: 'runComposerQueries',
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

describe('LiveActivityCard composer queries', () => {
    const runningTargets = [
        {
            message: 'Running "targets"',
            toolName: 'runComposerQueries',
            progressId: 'composer-call:targets',
            progressStatus: 'in_progress' as const,
        },
    ];

    it('shows the running node SQL by default while the query is running', async () => {
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
        expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();
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
            <LiveActivityCard isLive={false} toolGroups={composerToolGroups} />,
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
            <LiveActivityCard isLive={false} toolGroups={composerToolGroups} />,
        );
        expect(screen.getByRole('button', { expanded: false })).toBeVisible();
        expect(screen.queryByText('External data')).not.toBeVisible();
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
                    composerApproval={{
                        projectUuid: 'project',
                        agentUuid: 'agent',
                        threadUuid: 'thread',
                        pendingToolCallIds: ['composer-approval'],
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
