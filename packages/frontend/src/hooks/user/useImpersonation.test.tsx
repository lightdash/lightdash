import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import nock from 'nock';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_API_URL } from '../../api';
import { LAST_PROJECT_KEY, LAST_USER_KEY } from '../useActiveProject';
import { useStartImpersonation } from './useImpersonation';

const originalLocation = window.location;

describe('useStartImpersonation', () => {
    beforeEach(() => {
        localStorage.clear();
        Object.defineProperty(window, 'location', {
            value: {
                origin: originalLocation.origin,
                reload: vi.fn(),
            },
            configurable: true,
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            configurable: true,
        });
    });

    it('keeps the active project for the impersonated user', async () => {
        localStorage.setItem(LAST_PROJECT_KEY, 'project-1');
        localStorage.setItem(LAST_USER_KEY, 'admin-user');

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
        const scope = nock(BASE_API_URL)
            .post('/api/v1/impersonation/start', {
                targetUserUuid: 'target-user',
            })
            .reply(200, { status: 'ok', results: null });

        const { result } = renderHook(() => useStartImpersonation(), {
            wrapper,
        });
        result.current.mutate('target-user');

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(scope.isDone()).toBe(true);
        expect(localStorage.getItem(LAST_PROJECT_KEY)).toBe('project-1');
        expect(localStorage.getItem(LAST_USER_KEY)).toBe('target-user');
        expect(window.location.reload).toHaveBeenCalledOnce();
    });
});
