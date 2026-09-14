import { act, render } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshForBuildSkew } from './buildHashHandshake';
import BuildSkewRefresher from './BuildSkewRefresher';

vi.mock('./buildHashHandshake', () => ({
    refreshForBuildSkew: vi.fn(),
}));

const renderWithRouter = () => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <>
                        <BuildSkewRefresher />
                        <Outlet />
                    </>
                ),
                children: [
                    { index: true, element: <div>home</div> },
                    { path: 'other', element: <div>other</div> },
                ],
            },
        ],
        { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    return router;
};

describe('BuildSkewRefresher', () => {
    beforeEach(() => {
        vi.mocked(refreshForBuildSkew).mockClear();
    });

    it('does not refresh on first render', () => {
        renderWithRouter();

        expect(refreshForBuildSkew).not.toHaveBeenCalled();
    });

    it('refreshes on the next navigation', async () => {
        const router = renderWithRouter();

        await act(async () => {
            await router.navigate('/other');
        });

        expect(refreshForBuildSkew).toHaveBeenCalledTimes(1);
    });

    it('checks again on each subsequent navigation', async () => {
        const router = renderWithRouter();

        await act(async () => {
            await router.navigate('/other');
        });
        await act(async () => {
            await router.navigate('/');
        });

        expect(refreshForBuildSkew).toHaveBeenCalledTimes(2);
    });
});
