import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
    refetchFeatureFlags,
    useServerFeatureFlag,
} from './useServerOrClientFeatureFlag';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

import { lightdashApi } from '../api';

const mockApi = lightdashApi as unknown as Mock;

const createQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, staleTime: 30000 },
            mutations: { retry: false },
        },
    });

const createWrapper = (queryClient: QueryClient) =>
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };

describe('refetchFeatureFlags', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Flags resolve per org on the server, so a value cached before the org (or
    // its first project) existed is wrong for the rest of the session. Because
    // the query sets refetchOnMount: false, invalidating is not enough — the
    // next page to mount would still read the stale value.
    it('refreshes flags cached by an unmounted consumer', async () => {
        const queryClient = createQueryClient();
        const wrapper = createWrapper(queryClient);

        mockApi.mockResolvedValueOnce({ id: 'a-flag', enabled: false });
        const first = renderHook(() => useServerFeatureFlag('a-flag'), {
            wrapper,
        });
        await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
        first.unmount();

        mockApi.mockResolvedValueOnce({ id: 'a-flag', enabled: true });
        await refetchFeatureFlags(queryClient);

        const second = renderHook(() => useServerFeatureFlag('a-flag'), {
            wrapper,
        });
        await waitFor(() =>
            expect(second.result.current.data?.enabled).toBe(true),
        );
        expect(mockApi).toHaveBeenCalledTimes(2);
    });
});
