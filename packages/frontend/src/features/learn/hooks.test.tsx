import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { useRecordLearnEvent } from './hooks';

const lightdashApi = vi.hoisted(() => vi.fn());

vi.mock('../../api', () => ({ lightdashApi }));

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
        ...renderHook(() => useRecordLearnEvent(), { wrapper }),
    };
};

describe('useRecordLearnEvent', () => {
    beforeEach(() => {
        lightdashApi.mockReset();
        localStorage.clear();
    });

    it('invalidates the badges as well as the progress once an event settles', async () => {
        lightdashApi.mockResolvedValue({ accepted: 1 });
        const { queryClient, result } = renderWithClient();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

        act(() =>
            result.current.record({
                verb: 'completed',
                object: { type: 'course', course: 'viewer-fundamentals' },
            }),
        );

        await waitFor(() => {
            expect(invalidateQueries).toHaveBeenCalledWith(['learn-progress']);
            // Tiers are read-time on the server: a stale badge contradicts the
            // rail sitting beside it.
            expect(invalidateQueries).toHaveBeenCalledWith(['learn-badges']);
        });
    });
});
