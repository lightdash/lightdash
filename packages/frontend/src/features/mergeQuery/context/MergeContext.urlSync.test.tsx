import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { MergeProvider } from './MergeContext';

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
});
