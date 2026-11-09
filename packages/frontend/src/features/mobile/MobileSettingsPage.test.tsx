import {
    MOBILE_APP_STORE_URL,
    MOBILE_GOOGLE_PLAY_URL,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import MobileAppLandingPage from './MobileAppLandingPage';
import { MobileSettingsPage } from './MobileSettingsPage';
import { useMobileAppLink } from './useMobileAppLink';

vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: { siteUrl: 'https://app.example.com' } }),
}));
vi.mock('./useMobileAppLink', () => ({ useMobileAppLink: vi.fn() }));

const SCAN_URL = 'https://app.example.com/m/app/scan-id';

const mockLink = (overrides: Partial<ReturnType<typeof useMobileAppLink>>) =>
    vi.mocked(useMobileAppLink).mockReturnValue({
        link: {
            linkUuid: 'link-1',
            scanUrl: SCAN_URL,
            expiresAt: '2026-11-09T12:30:00.000Z',
        },
        isScanned: false,
        remainingSeconds: 29 * 60 + 41,
        isMinting: false,
        mintError: null,
        retry: vi.fn(),
        ...overrides,
    });

beforeEach(() => vi.mocked(useMobileAppLink).mockReset());

describe('MobileSettingsPage', () => {
    it('shows the QR code, its link and the time left while waiting', async () => {
        mockLink({});
        renderWithProviders(<MobileSettingsPage />);

        expect(
            await screen.findByRole('img', {
                name: 'QR code to install the Lightdash app',
            }),
        ).toBeInTheDocument();
        expect(screen.getByText(SCAN_URL)).toBeVisible();
        expect(screen.getByText('Waiting for scan')).toBeVisible();
        expect(screen.getByText('Expires in 29:41')).toBeVisible();
        expect(screen.queryByText(/^Sign in to/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Scan this/)).not.toBeInTheDocument();
    });

    it('opens the sign-in step when the user already has the app', async () => {
        mockLink({});
        renderWithProviders(<MobileSettingsPage />);

        await userEvent.click(
            screen.getByRole('button', { name: 'I already have the app' }),
        );

        expect(screen.getByText('Sign in to app.example.com.')).toBeVisible();
    });

    it('announces a scan and opens the sign-in step', () => {
        mockLink({ isScanned: true });
        renderWithProviders(<MobileSettingsPage />);

        expect(screen.getByRole('status')).toHaveTextContent(
            'Opened on a phone',
        );
        expect(screen.getByText('Sign in to app.example.com.')).toBeVisible();
        expect(
            screen.queryByRole('img', {
                name: 'QR code to install the Lightdash app',
            }),
        ).not.toBeInTheDocument();
    });

    it('shows the server error with a retry button when a mint fails', async () => {
        const retry = vi.fn();
        mockLink({
            link: null,
            remainingSeconds: null,
            retry,
            mintError: {
                status: 'error',
                error: {
                    name: 'TooManyRequestsError',
                    statusCode: 429,
                    message: 'Too many app links. Try again in an hour.',
                    data: {},
                },
            },
        });
        renderWithProviders(<MobileSettingsPage />);

        expect(
            screen.getByText('Too many app links. Try again in an hour.'),
        ).toBeVisible();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try again' }),
        );
        expect(retry).toHaveBeenCalledOnce();
    });
});

describe('MobileAppLandingPage', () => {
    it('links to both app stores', () => {
        renderWithProviders(<MobileAppLandingPage />);

        expect(
            screen.getByRole('link', { name: 'Download on the App Store' }),
        ).toHaveAttribute('href', MOBILE_APP_STORE_URL);
        expect(
            screen.getByRole('link', { name: 'Get it on Google Play' }),
        ).toHaveAttribute('href', MOBILE_GOOGLE_PLAY_URL);
    });
});
