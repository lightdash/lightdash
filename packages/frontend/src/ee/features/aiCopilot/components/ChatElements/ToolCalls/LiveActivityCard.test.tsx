import { QuerySourceType } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { LiveActivityCard } from './LiveActivityCard';

describe('LiveActivityCard composer queries', () => {
    it('shows composer SQL by default while the query is running', async () => {
        renderWithProviders(
            <LiveActivityCard
                isLive
                toolGroups={[
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
                                            sourceType:
                                                QuerySourceType.EXTERNAL,
                                            nodeId: 'targets',
                                            sql: 'select * from targets_csv',
                                            tables: ['targets_csv'],
                                            limit: 500,
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                ]}
            />,
        );

        await waitFor(() =>
            expect(screen.getByText('External data')).toBeVisible(),
        );
        expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();
    });
});
