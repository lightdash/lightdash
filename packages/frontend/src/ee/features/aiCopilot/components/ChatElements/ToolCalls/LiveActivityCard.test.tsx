import { QuerySourceType } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
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
    it('shows composer SQL by default while the query is running', async () => {
        renderWithProviders(
            <LiveActivityCard isLive toolGroups={composerToolGroups} />,
        );

        await waitFor(() =>
            expect(screen.getByText('External data')).toBeVisible(),
        );
        expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();
    });

    it('collapses the steps once the run finishes', async () => {
        const { rerender } = renderWithProviders(
            <LiveActivityCard isLive toolGroups={composerToolGroups} />,
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
