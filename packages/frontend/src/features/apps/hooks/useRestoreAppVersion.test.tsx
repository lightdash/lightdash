import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { useRestoreAppVersion } from './useRestoreAppVersion';

const lightdashApi = vi.hoisted(() => vi.fn());

vi.mock('../../../api', () => ({ lightdashApi }));

const renderWithClient = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    return {
        queryClient,
        ...renderHook(() => useRestoreAppVersion(), { wrapper }),
    };
};

describe('useRestoreAppVersion', () => {
    beforeEach(() => {
        lightdashApi.mockReset();
    });

    it('invalidates the visualization contract as well as the timeline', async () => {
        lightdashApi.mockResolvedValue({ appUuid: 'viz-1', version: 8 });
        const { queryClient, result } = renderWithClient();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

        await result.current.mutateAsync({
            projectUuid: 'project-1',
            appUuid: 'viz-1',
            version: 3,
        });

        await waitFor(() => {
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: ['app', 'project-1', 'viz-1'],
            });
            // A restored version declares its own fields, so a panel left open
            // over the pre-restore contract would map onto stale slot names.
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: ['data-app-viz', 'project-1', 'viz-1'],
            });
        });
    });
});
