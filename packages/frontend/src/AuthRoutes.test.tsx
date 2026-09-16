import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import AuthRoutes from './AuthRoutes';

vi.mock('./components/PrivateRoute', () => ({
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./components/AppRoute', () => ({
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./components/ProjectRoute', () => ({
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./components/Mobile/MobileNavBar', () => ({
    MobileNavBar: () => null,
}));

vi.mock('./pages/Invite', () => ({
    default: () => <div data-testid="invite-page" />,
}));

vi.mock('./pages/PasswordReset', () => ({
    default: () => <div data-testid="password-reset-page" />,
}));

vi.mock('./providers/Tracking/TrackingProvider', () => ({
    TrackPage: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

const renderAuthRouteAt = (pathname: string) => {
    const router = createMemoryRouter(AuthRoutes, {
        initialEntries: [pathname],
    });

    return render(
        <MantineProvider env="test">
            <RouterProvider router={router} />
        </MantineProvider>,
    );
};

describe('AuthRoutes', () => {
    it('renders the invite activation page', async () => {
        renderAuthRouteAt('/invite/some-invite-code');

        expect(await screen.findByTestId('invite-page')).toBeInTheDocument();
    });

    it('renders the password reset page', async () => {
        renderAuthRouteAt('/reset-password/some-code');

        expect(
            await screen.findByTestId('password-reset-page'),
        ).toBeInTheDocument();
    });
});
