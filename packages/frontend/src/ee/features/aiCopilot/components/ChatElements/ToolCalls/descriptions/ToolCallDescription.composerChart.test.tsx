import { screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../../testing/testUtils';
import { store } from '../../../../store';
import { ToolCallDescription } from './ToolCallDescription';

vi.mock('../../../../../../../api');

const toolArgs = {
    slug: 'birch-totals',
    type: 'composer_chart',
    patch: [
        {
            op: 'replace',
            path: '/pipeline/nodes/0/sql',
            value: "SELECT 'A' AS category, 14 AS amount",
        },
    ],
};

const renderEdit = (approval: boolean) =>
    renderWithProviders(
        <Provider store={store}>
            <ToolCallDescription
                toolName="editContent"
                toolCall={{
                    toolCallId: 'call-1',
                    toolName: 'editContent',
                    toolArgs,
                }}
                approval={
                    approval
                        ? {
                              projectUuid: 'project-uuid',
                              agentUuid: 'agent-uuid',
                              threadUuid: 'thread-uuid',
                              toolCallId: 'call-1',
                          }
                        : undefined
                }
            />
        </Provider>,
    );

describe('composer chart edit awaiting SQL approval', () => {
    it('shows the new SQL with approve and reject', () => {
        const { container } = renderEdit(true);

        expect(screen.getByText('Update composer chart')).toBeInTheDocument();
        expect(container.textContent).toContain('14 AS amount');
        expect(
            screen.getByRole('button', { name: 'Approve' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Reject' }),
        ).toBeInTheDocument();
    });

    it('shows a plain edit once nothing waits', () => {
        renderEdit(false);

        expect(
            screen.queryByRole('button', { name: 'Approve' }),
        ).not.toBeInTheDocument();
    });
});
