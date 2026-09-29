import { screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../../../api';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { store } from '../../../store';
import { SqlApprovalCard } from './SqlApprovalCard';

vi.mock('../../../../../../api', () => ({ lightdashApi: vi.fn() }));
const mockedLightdashApi = vi.mocked(lightdashApi);

const target = {
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-1',
    toolCallId: 'tool-call-2',
};

const renderCard = () =>
    renderWithProviders(
        <Provider store={store}>
            <SqlApprovalCard {...target} toolArgs={{ sql: 'select 1' }} />
        </Provider>,
    );

describe('SqlApprovalCard', () => {
    afterEach(() => {
        window.sessionStorage.clear();
        mockedLightdashApi.mockReset();
    });

    it('shows the approval prompt when the thread is not auto-approved', () => {
        renderCard();

        expect(
            screen.getByRole('button', { name: 'Approve' }),
        ).toBeInTheDocument();
        expect(mockedLightdashApi).not.toHaveBeenCalled();
    });

    it('approves later SQL calls once the thread is set to approve always', async () => {
        window.sessionStorage.setItem(
            'sql-auto-approve:thread-1',
            JSON.stringify(true),
        );
        mockedLightdashApi.mockResolvedValue(undefined);

        renderCard();

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
});
