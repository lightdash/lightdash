import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

const state = vi.hoisted(() => ({
    useGetShare: vi.fn(),
}));

vi.mock('../hooks/useShare', () => ({
    useGetShare: state.useGetShare,
}));

// eslint-disable-next-line import/first
import ShareRedirect from './ShareRedirect';

const DASHBOARD_PATH = '/projects/p1/dashboards/d1/view';
const EXPLORER_PATH = '/projects/p1/tables/orders';

const renderFromDashboard = () => {
    const router = createMemoryRouter(
        [
            { path: DASHBOARD_PATH, element: <div>Dashboard page</div> },
            { path: '/share/:shareNanoid', element: <ShareRedirect /> },
            { path: EXPLORER_PATH, element: <div>Explorer page</div> },
        ],
        {
            initialEntries: [DASHBOARD_PATH, '/share/abc123'],
            initialIndex: 1,
        },
    );
    render(
        <MantineProvider>
            <RouterProvider router={router} />
        </MantineProvider>,
    );
    return router;
};

describe('ShareRedirect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('replaces the share entry so one back step returns to the previous page', async () => {
        state.useGetShare.mockReturnValue({
            data: {
                url: `${EXPLORER_PATH}?create_saved_chart_version=%7B%7D`,
            },
            error: null,
        });

        const router = renderFromDashboard();

        await screen.findByText('Explorer page');
        expect(router.state.location.pathname).toBe(EXPLORER_PATH);
        expect(router.state.location.search).toBe(
            '?create_saved_chart_version=%7B%7D',
        );

        await router.navigate(-1);

        await waitFor(() =>
            expect(router.state.location.pathname).toBe(DASHBOARD_PATH),
        );
        expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    });

    it('stays on the loading state until the share resolves', () => {
        state.useGetShare.mockReturnValue({ data: undefined, error: null });

        const router = renderFromDashboard();

        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/share/abc123');
    });

    it('shows an error state when the share link does not exist', () => {
        state.useGetShare.mockReturnValue({
            data: undefined,
            error: { error: { statusCode: 404 } },
        });

        const router = renderFromDashboard();

        expect(
            screen.getByText('Shared link does not exist'),
        ).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/share/abc123');
    });
});
