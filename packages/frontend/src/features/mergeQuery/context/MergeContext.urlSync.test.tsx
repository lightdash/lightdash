import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { MergeProvider } from './MergeContext';
import { MERGE_URL_PARAM } from './mergeUrlState';
import { useMerge } from './useMerge';

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));

describe('merge URL sync', () => {
    it('leaves the location alone when there is no merge to mirror', async () => {
        const router = createMemoryRouter(
            [
                {
                    path: '/explore',
                    element: (
                        <MergeProvider>
                            <div>explorer</div>
                        </MergeProvider>
                    ),
                },
            ],
            {
                initialEntries: [
                    {
                        pathname: '/explore',
                        search: '?embedBackUrl=%2Fback',
                        state: { embedBackUrl: '/back' },
                    },
                ],
            },
        );
        renderWithProviders(<RouterProvider router={router} />);

        await screen.findByText('explorer');
        expect(router.state.location.search).toBe('?embedBackUrl=%2Fback');
        expect(router.state.location.state).toEqual({ embedBackUrl: '/back' });
    });

    it('keeps a URL change written in the same commit as a merge change', async () => {
        // Stands in for the Explorer's URL sync: a child that reads the latest location at write time.
        let router: ReturnType<typeof createMemoryRouter> | null = null;
        const ExplorerUrlSync = () => {
            const { addSource } = useMerge();
            const navigate = useNavigate();
            const [query, setQuery] = useState('filtered');
            useEffect(() => {
                const next = new URLSearchParams(router?.state.location.search);
                next.set('query', query);
                void navigate({ search: next.toString() }, { replace: true });
            }, [query, navigate]);
            return (
                <button
                    onClick={() => {
                        addSource('b');
                        setQuery('unfiltered');
                    }}
                >
                    change
                </button>
            );
        };
        const memoryRouter = createMemoryRouter(
            [
                {
                    path: '/explore',
                    element: (
                        <MergeProvider>
                            <ExplorerUrlSync />
                        </MergeProvider>
                    ),
                },
            ],
            { initialEntries: ['/explore'] },
        );
        router = memoryRouter;
        renderWithProviders(<RouterProvider router={memoryRouter} />);

        await userEvent.click(await screen.findByText('change'));

        await waitFor(() => {
            const params = new URLSearchParams(
                memoryRouter.state.location.search,
            );
            expect(params.has(MERGE_URL_PARAM)).toBe(true);
            expect(params.get('query')).toBe('unfiltered');
        });
    });
});
