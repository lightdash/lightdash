import { NotFoundError, type ApiError } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../../../testing/testUtils';
import { useAiAgentThread } from './useProjectAiAgents';

vi.mock('../../../../api');

const Observer = () => {
    const { isError } = useAiAgentThread('project', 'agent', 'missing');
    return <p>{isError ? 'errored' : 'loading'}</p>;
};

beforeEach(() => {
    const error: ApiError = {
        status: 'error',
        error: new NotFoundError('AI agent thread not found'),
    };
    mockedLightdashApi.mockRejectedValue(error);
});

describe('useAiAgentThread', () => {
    it('shows one toast when several observers share a failed thread', async () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        renderWithProviders(
            <QueryClientProvider client={client}>
                <MemoryRouter>
                    <Observer />
                    <Observer />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        await waitFor(() =>
            expect(screen.getAllByText('errored')).toHaveLength(2),
        );
        expect(
            await screen.findAllByText('Failed to fetch AI agent thread'),
        ).toHaveLength(1);
    });
});
