import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('./user/useAccount', () => ({
    useAccount: () => ({ data: { user: { userUuid: 'user-1' } } }),
}));

vi.mock('./organization/useOrganization', () => ({
    useOrganization: () => ({
        data: { organizationUuid: 'org-1' },
        isInitialLoading: false,
    }),
}));

vi.mock('./useProject', () => ({
    useProject: (projectUuid?: string) => ({
        data: projectUuid ? { projectUuid } : undefined,
        isInitialLoading: false,
    }),
}));

vi.mock('./useProjects', () => ({
    useProjects: () => ({ data: [], isInitialLoading: false }),
}));

let routeProjectUuid: string | undefined;
vi.mock('react-router', () => ({
    useParams: () => ({ projectUuid: routeProjectUuid }),
}));

import {
    LAST_PROJECT_KEY,
    resetPersistingProjectUuidForTests,
    useActiveProjectUuid,
    useUpdateActiveProjectMutation,
} from './useActiveProject';

function createWrapper() {
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
    return { wrapper, queryClient };
}

describe('useUpdateActiveProjectMutation', () => {
    beforeEach(() => {
        localStorage.clear();
        routeProjectUuid = undefined;
        resetPersistingProjectUuidForTests();
    });

    it('invalidates only the keys that depend on the active project', async () => {
        const { wrapper, queryClient } = createWrapper();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
        const removeQueries = vi.spyOn(queryClient, 'removeQueries');

        const { result } = renderHook(() => useUpdateActiveProjectMutation(), {
            wrapper,
        });
        result.current.mutate('project-1');

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const invalidatedKeys = invalidateQueries.mock.calls.map(
            ([key]) => key,
        );
        expect(invalidatedKeys).toEqual([
            ['activeProject'],
            ['validation'],
            ['project'],
        ]);
        // The regression this guards: invalidateQueries() with no arguments
        // matches every key, refetching the whole app on a project switch
        expect(invalidateQueries).not.toHaveBeenCalledWith();
        expect(removeQueries).not.toHaveBeenCalled();
    });

    it('keeps pre-warmed project caches visible instead of removing them', async () => {
        const { wrapper, queryClient } = createWrapper();
        queryClient.setQueryData(['projects'], [{ projectUuid: 'project-1' }]);
        queryClient.setQueryData(['project', 'project-1'], {
            projectUuid: 'project-1',
        });

        const { result } = renderHook(() => useUpdateActiveProjectMutation(), {
            wrapper,
        });
        result.current.mutate('project-1');

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(queryClient.getQueryData(['projects'])).toEqual([
            { projectUuid: 'project-1' },
        ]);
        expect(queryClient.getQueryData(['project', 'project-1'])).toEqual({
            projectUuid: 'project-1',
        });
    });
});

describe('useActiveProjectUuid', () => {
    beforeEach(() => {
        localStorage.clear();
        resetPersistingProjectUuidForTests();
    });

    it('persists the active project once when several instances mount together', async () => {
        routeProjectUuid = 'project-herd';
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        const { wrapper } = createWrapper();

        renderHook(
            () => {
                useActiveProjectUuid();
                useActiveProjectUuid();
                useActiveProjectUuid();
            },
            { wrapper },
        );

        await waitFor(() =>
            expect(localStorage.getItem(LAST_PROJECT_KEY)).toBe('project-herd'),
        );

        const persistCalls = setItem.mock.calls.filter(
            ([key]) => key === LAST_PROJECT_KEY,
        );
        expect(persistCalls).toHaveLength(1);
        setItem.mockRestore();
    });
});
