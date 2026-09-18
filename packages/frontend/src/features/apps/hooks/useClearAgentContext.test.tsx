import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { useClearAgentContext } from './useClearAgentContext';

const lightdashApi = vi.hoisted(() => vi.fn());

vi.mock('../../../api', () => ({ lightdashApi }));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: vi.fn() }),
}));

const renderWithClient = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    const fetchApp = vi.fn().mockResolvedValue({ appUuid: 'app-1' });

    return {
        fetchApp,
        ...renderHook(
            () => ({
                app: useQuery({
                    queryKey: ['app', 'project-1', 'app-1'],
                    queryFn: fetchApp,
                }),
                clear: useClearAgentContext('project-1', 'app-1'),
            }),
            { wrapper },
        ),
    };
};

describe('useClearAgentContext', () => {
    beforeEach(() => {
        lightdashApi.mockReset();
    });

    it('resolves with the app and refetches it once the thread is cleared', async () => {
        const cleared = { appUuid: 'app-1', currentThread: { number: 2 } };
        lightdashApi.mockResolvedValue(cleared);
        const { fetchApp, result } = renderWithClient();
        await waitFor(() => expect(result.current.app.isSuccess).toBe(true));
        expect(fetchApp).toHaveBeenCalledTimes(1);

        await expect(result.current.clear.mutateAsync()).resolves.toEqual(
            cleared,
        );

        await waitFor(() => expect(fetchApp).toHaveBeenCalledTimes(2));
    });
});
