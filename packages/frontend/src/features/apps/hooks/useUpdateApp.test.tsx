import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { useUpdateApp } from './useUpdateApp';

const lightdashApi = vi.hoisted(() => vi.fn());

vi.mock('../../../api', () => ({ lightdashApi }));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));
vi.mock('../../../hooks/useContent', () => ({
    invalidateContent: vi.fn(),
}));

const renderWithClient = (appUuidOrSlug?: string) => {
    const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    return {
        queryClient,
        ...renderHook(() => useUpdateApp({ appUuidOrSlug }), { wrapper }),
    };
};

describe('useUpdateApp', () => {
    beforeEach(() => {
        lightdashApi.mockReset();
    });

    it('invalidates app and chart type details addressed by UUID or slug', async () => {
        lightdashApi.mockResolvedValue({});
        const { queryClient, result } = renderWithClient('chart-type-slug');
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

        await result.current.mutateAsync({
            projectUuid: 'project-1',
            appUuid: 'app-uuid',
            icon: 'chart-bar',
        });

        await waitFor(() => {
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: ['app', 'project-1', 'app-uuid'],
            });
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: ['app', 'project-1', 'chart-type-slug'],
            });
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: ['data-app-viz', 'project-1', 'app-uuid'],
            });
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: ['data-app-viz', 'project-1', 'chart-type-slug'],
            });
        });

        expect(invalidateQueries).not.toHaveBeenCalledWith({
            queryKey: ['app', 'project-1'],
        });
        expect(invalidateQueries).not.toHaveBeenCalledWith({
            queryKey: ['data-app-viz', 'project-1'],
        });
    });
});
