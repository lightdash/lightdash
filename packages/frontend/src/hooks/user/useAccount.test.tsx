import { type AnonymousAccount } from '@lightdash/common';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, vi } from 'vitest';
import { createQueryClient } from '../../providers/ReactQuery/createQueryClient';
import { useAccount } from './useAccount';

const lightdashApi = vi.hoisted(() => vi.fn());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => lightdashApi,
}));

const transientNetworkError = {
    status: 'error',
    error: {
        name: 'NetworkError',
        statusCode: 500,
        message: 'Unable to reach the server.',
        data: {},
    },
};

const account = {
    authentication: { type: 'jwt' },
    organization: { organizationUuid: 'org-uuid' },
    user: { id: 'user-uuid', type: 'anonymous', abilityRules: [] },
    embedWriteContext: { canUpdateDashboard: true },
};

function createWrapper() {
    const queryClient = createQueryClient({
        queries: { retryDelay: () => 0 },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

describe('useAccount', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('recovers from a transient NetworkError', async () => {
        lightdashApi
            .mockRejectedValueOnce(transientNetworkError)
            .mockResolvedValue(account);

        const { result } = renderHook(() => useAccount<AnonymousAccount>(), {
            wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true), {
            timeout: 3000,
        });
        expect(result.current.data?.embedWriteContext).toEqual(
            account.embedWriteContext,
        );
        expect(lightdashApi).toHaveBeenCalledTimes(2);
    });

    it('does not retry an API error', async () => {
        lightdashApi.mockRejectedValue({
            status: 'error',
            error: {
                name: 'UnauthorizedError',
                statusCode: 401,
                message: 'Unauthorized',
                data: {},
            },
        });

        const { result } = renderHook(() => useAccount(), {
            wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(lightdashApi).toHaveBeenCalledTimes(1);
    });
});
