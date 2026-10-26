import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, vi } from 'vitest';
import { createQueryClient } from '../../providers/ReactQuery/createQueryClient';
import useUser from './useUser';

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
    authentication: { type: 'session' },
    organization: { organizationUuid: 'org-uuid' },
    user: { id: 'user-uuid', type: 'registered', abilityRules: [] },
};

const user = {
    userUuid: 'user-uuid',
    organizationUuid: 'org-uuid',
    abilityRules: [],
    impersonation: null,
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

const userRequests = () =>
    lightdashApi.mock.calls.filter(([{ url }]) => url === '/user').length;

describe('useUser', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('recovers from a transient NetworkError', async () => {
        let userCalls = 0;
        lightdashApi.mockImplementation(async ({ url }: { url: string }) => {
            if (url === '/user/account') return account;
            userCalls += 1;
            if (userCalls === 1) throw transientNetworkError;
            return user;
        });

        const { result } = renderHook(() => useUser(true), {
            wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true), {
            timeout: 3000,
        });
        expect(result.current.data?.organizationUuid).toBe('org-uuid');
        expect(userRequests()).toBe(2);
    });

    it('does not retry an API error', async () => {
        lightdashApi.mockImplementation(async ({ url }: { url: string }) => {
            if (url === '/user/account') return account;
            throw {
                status: 'error',
                error: {
                    name: 'UnauthorizedError',
                    statusCode: 401,
                    message: 'Unauthorized',
                    data: {},
                },
            };
        });

        const { result } = renderHook(() => useUser(true), {
            wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(userRequests()).toBe(1);
    });
});
