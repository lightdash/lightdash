import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../../../../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { store } from '../../../store';
import { SqlRunToolCallDescription } from './descriptions/SqlRunToolCallDescription';

vi.mock('../../../../../../api');

const approval = {
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-1',
    toolCallId: 'tool-call-2',
};

const renderDescription = () =>
    renderWithProviders(
        <Provider store={store}>
            <SqlRunToolCallDescription sql="select 1" approval={approval} />
        </Provider>,
    );

describe('SqlRunToolCallDescription approval', () => {
    afterEach(() => {
        window.sessionStorage.clear();
        mockedLightdashApi.mockReset();
    });

    it('shows approval actions under the SQL when the thread is not auto-approved', () => {
        renderDescription();

        expect(
            screen.getByRole('button', { name: 'Approve' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Reject' }),
        ).toBeInTheDocument();
        expect(mockedLightdashApi).not.toHaveBeenCalled();
    });

    it('approves later SQL calls once the thread is set to approve always', async () => {
        window.sessionStorage.setItem(
            'sql-auto-approve:thread-1',
            JSON.stringify(true),
        );
        mockedLightdashApi.mockResolvedValue(undefined);

        renderDescription();

        await waitFor(() =>
            expect(mockedLightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/projects/project-1/aiAgents/agent-1/threads/thread-1/tool-calls/tool-call-2/sql-approval',
                    method: 'POST',
                    body: JSON.stringify({ decision: 'approved' }),
                }),
            ),
        );
        expect(
            screen.queryByRole('button', { name: 'Approve' }),
        ).not.toBeInTheDocument();
    });

    it('approves from the enlarged SQL modal and closes it', async () => {
        mockedLightdashApi.mockResolvedValue(undefined);
        renderDescription();

        await userEvent.click(
            screen.getByRole('button', { name: 'Expand SQL' }),
        );
        const dialog = await screen.findByRole('dialog');
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Approve' }),
        );

        await waitFor(() =>
            expect(mockedLightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: JSON.stringify({ decision: 'approved' }),
                }),
            ),
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
    });

    it('closes the enlarged SQL modal from its header without deciding', async () => {
        renderDescription();

        await userEvent.click(
            screen.getByRole('button', { name: 'Expand SQL' }),
        );
        const dialog = await screen.findByRole('dialog');
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Close' }),
        );

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(mockedLightdashApi).not.toHaveBeenCalled();
        expect(
            screen.getByRole('button', { name: 'Approve' }),
        ).toBeInTheDocument();
    });
});
