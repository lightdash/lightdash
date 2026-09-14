import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import MobileRoutes from './MobileRoutes';

vi.mock('./pages/Invite', () => ({
    default: () => <div data-testid="invite-page" />,
}));

vi.mock('./pages/PasswordReset', () => ({
    default: () => <div data-testid="password-reset-page" />,
}));

vi.mock('./pages/Register', () => ({
    default: () => <div data-testid="register-page" />,
}));

vi.mock('./pages/MobileSetup', () => ({
    default: () => <div data-testid="mobile-setup-page" />,
}));

vi.mock('./providers/Tracking/TrackingProvider', () => ({
    TrackPage: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

const renderMobileRouteAt = (pathname: string) => {
    const router = createMemoryRouter(MobileRoutes, {
        initialEntries: [pathname],
    });

    return render(
        <MantineProvider env="test">
            <RouterProvider router={router} />
        </MantineProvider>,
    );
};

describe('MobileRoutes', () => {
    it('renders the invite activation page', async () => {
        renderMobileRouteAt('/invite/some-invite-code');

        expect(await screen.findByTestId('invite-page')).toBeInTheDocument();
    });

    it('renders the password reset page', async () => {
        renderMobileRouteAt('/reset-password/some-code');

        expect(
            await screen.findByTestId('password-reset-page'),
        ).toBeInTheDocument();
    });

    it('renders the mobile app setup landing page, which only a phone reaches', async () => {
        renderMobileRouteAt(
            '/mobile-setup?v=1&i=http%3A%2F%2Flocalhost&c=code',
        );

        expect(
            await screen.findByTestId('mobile-setup-page'),
        ).toBeInTheDocument();
    });

    it('keeps the desktop-only gate on routes a phone cannot use', async () => {
        renderMobileRouteAt('/register');

        expect(
            await screen.findByText(
                'This page is not available to view on mobile yet.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('register-page')).not.toBeInTheDocument();
    });
});
