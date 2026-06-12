import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { vi, type Mock } from 'vitest';
import { useColumnTotalsEnabledByDefault } from './useAsyncCalculateTotal';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('./useQueryError', () => ({
    default: () => vi.fn(),
}));

let mockEmbedToken: string | undefined;
vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: mockEmbedToken }),
}));

import { lightdashApi } from '../api';

const mockApi = lightdashApi as unknown as Mock;

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

describe('useColumnTotalsEnabledByDefault', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEmbedToken = undefined;
    });

    it('is false while the project is loading, then true when the project has no defaults', async () => {
        mockApi.mockResolvedValue({ projectDefaults: undefined });

        const { result } = renderHook(
            () => useColumnTotalsEnabledByDefault('project-uuid'),
            { wrapper: createWrapper() },
        );

        // never enables totals before the project default is known
        expect(result.current).toBe(false);

        await waitFor(() => expect(result.current).toBe(true));
    });

    it('is true when the project default explicitly enables column totals', async () => {
        mockApi.mockResolvedValue({
            projectDefaults: { column_totals: true },
        });

        const { result } = renderHook(
            () => useColumnTotalsEnabledByDefault('project-uuid'),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current).toBe(true));
    });

    it('is false when the project default disables column totals', async () => {
        mockApi.mockResolvedValue({
            projectDefaults: { column_totals: false },
        });

        const { result } = renderHook(
            () => useColumnTotalsEnabledByDefault('project-uuid'),
            { wrapper: createWrapper() },
        );

        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({ url: '/projects/project-uuid' }),
            ),
        );

        expect(result.current).toBe(false);
    });

    it('falls back to enabled when the project fetch fails', async () => {
        mockApi.mockRejectedValue({
            error: { statusCode: 500, message: 'oops' },
        });

        const { result } = renderHook(
            () => useColumnTotalsEnabledByDefault('project-uuid'),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current).toBe(true));
    });

    it('is true in embed mode without fetching the project', async () => {
        mockEmbedToken = 'embed-token';

        const { result } = renderHook(
            () => useColumnTotalsEnabledByDefault('project-uuid'),
            { wrapper: createWrapper() },
        );

        expect(result.current).toBe(true);
        // give the project query a chance to (incorrectly) fire
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(mockApi).not.toHaveBeenCalled();
    });
});
