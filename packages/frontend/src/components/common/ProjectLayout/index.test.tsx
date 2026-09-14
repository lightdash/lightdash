import { Box, Button, MantineProvider, Text, TextInput } from '@mantine/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import {
    createMemoryRouter,
    Link,
    RouterProvider,
    useBlocker,
    type LoaderFunction,
    type RouteObject,
} from 'react-router';
import ProjectLayout from '.';

vi.mock('../../../features/scopeTours/ScopeTourHost', () => ({
    default: () => null,
}));

vi.mock(
    '../../../features/sourceCodeEditor/components/SourceCodeDrawer',
    () => ({
        default: () => null,
    }),
);

vi.mock('../../NavBar', () => ({
    default: () => (
        <Box component="nav">
            <Link to="/home">Home</Link>
        </Box>
    ),
}));

const renderLayout = ({
    home = <TextInput aria-label="Draft" defaultValue="Unsaved draft" />,
    loader,
    additionalRoutes = [],
}: {
    home?: ReactNode;
    loader?: LoaderFunction;
    additionalRoutes?: RouteObject[];
} = {}) => {
    const pendingModule = Promise.withResolvers<void>();
    const loadDestination = vi.fn(async () => {
        await pendingModule.promise;
        return { Component: () => <Text>Destination page</Text> };
    });
    const router = createMemoryRouter(
        [
            {
                element: <ProjectLayout />,
                errorElement: <Text>Unable to load page</Text>,
                children: [
                    { path: '/home', element: home, loader },
                    {
                        path: '/destination',
                        lazy: loadDestination,
                    },
                    ...additionalRoutes,
                ],
            },
        ],
        { initialEntries: ['/home'] },
    );

    render(
        <MantineProvider env="test">
            <RouterProvider router={router} />
        </MantineProvider>,
    );

    return { router, pendingModule, loadDestination };
};

describe('ProjectLayout navigation feedback', () => {
    it('shows loading before the route module resolves and clears it on arrival', async () => {
        const { router, pendingModule } = renderLayout();

        await act(async () => {
            void router.navigate('/destination');
        });

        expect(screen.getByRole('status')).toHaveTextContent('Loading page');
        expect(screen.getByTestId('page-spinner')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/home');
        expect(screen.queryByText('Destination page')).not.toBeInTheDocument();

        await act(async () => pendingModule.resolve());

        expect(await screen.findByText('Destination page')).toBeVisible();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/destination');
    });

    it('preserves the current page and edits when pending navigation is cancelled', async () => {
        const user = userEvent.setup();
        const { router, pendingModule } = renderLayout();
        const draft = screen.getByRole('textbox', { name: 'Draft' });
        await user.type(draft, ' with changes');

        await act(async () => {
            void router.navigate('/destination');
        });

        expect(draft).toBeInTheDocument();
        expect(draft.closest('[inert]')).not.toBeNull();
        expect(screen.getByRole('link', { name: 'Home' })).toBeVisible();

        await user.click(screen.getByRole('link', { name: 'Home' }));

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(draft);
        expect(draft).toHaveValue('Unsaved draft with changes');
        expect(draft.closest('[inert]')).toBeNull();

        await act(async () => pendingModule.resolve());

        expect(router.state.location.pathname).toBe('/home');
        expect(screen.queryByText('Destination page')).not.toBeInTheDocument();
    });

    it('clears loading when the route module fails so the error remains accessible', async () => {
        const { router, pendingModule } = renderLayout();

        await act(async () => {
            void router.navigate('/destination');
        });
        expect(screen.getByRole('status')).toBeInTheDocument();

        await act(async () => pendingModule.reject(new Error('Route failed')));

        const error = await screen.findByText('Unable to load page');
        expect(error).toBeVisible();
        expect(error.closest('[inert]')).toBeNull();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps loading for a newer navigation when an abandoned module resolves', async () => {
        const newerModule = Promise.withResolvers<void>();
        const { router, pendingModule } = renderLayout({
            additionalRoutes: [
                {
                    path: '/newer',
                    lazy: async () => {
                        await newerModule.promise;
                        return { Component: () => <Text>Newer page</Text> };
                    },
                },
            ],
        });

        await act(async () => {
            void router.navigate('/destination');
        });
        await act(async () => {
            void router.navigate('/newer');
        });
        await act(async () => pendingModule.resolve());

        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByText('Destination page')).not.toBeInTheDocument();

        await act(async () => newerModule.resolve());

        expect(await screen.findByText('Newer page')).toBeVisible();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/newer');
    });

    it('shows loading only after the unsaved-changes blocker allows navigation', async () => {
        const user = userEvent.setup();
        const BlockedEditor = () => {
            const blocker = useBlocker(true);
            return (
                <>
                    <TextInput
                        aria-label="Draft"
                        defaultValue="Unsaved draft"
                    />
                    {blocker.state === 'blocked' && (
                        <>
                            <Button onClick={() => blocker.reset()}>
                                Keep editing
                            </Button>
                            <Button onClick={() => blocker.proceed()}>
                                Leave page
                            </Button>
                        </>
                    )}
                </>
            );
        };
        const { router, loadDestination, pendingModule } = renderLayout({
            home: <BlockedEditor />,
        });

        await act(async () => {
            await router.navigate('/destination');
        });

        expect(
            screen.getByRole('button', { name: 'Keep editing' }),
        ).toBeVisible();
        expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue(
            'Unsaved draft',
        );
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(loadDestination).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Keep editing' }));
        expect(router.state.location.pathname).toBe('/home');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        await act(async () => {
            await router.navigate('/destination');
        });
        await user.click(screen.getByRole('button', { name: 'Leave page' }));

        expect(screen.getByRole('status')).toBeInTheDocument();

        await act(async () => pendingModule.resolve());

        expect(await screen.findByText('Destination page')).toBeVisible();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('does not cover the page for a pending query-string update', async () => {
        const pendingLoader = Promise.withResolvers<null>();
        const { router } = renderLayout({
            loader: ({ request }) =>
                new URL(request.url).search ? pendingLoader.promise : null,
        });
        const draft = await screen.findByRole('textbox', { name: 'Draft' });

        await act(async () => {
            void router.navigate('/home?filter=updated');
        });

        expect(router.state.navigation.state).toBe('loading');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(draft.closest('[inert]')).toBeNull();

        await act(async () => pendingLoader.resolve(null));

        expect(router.state.location.search).toBe('?filter=updated');
    });
});
