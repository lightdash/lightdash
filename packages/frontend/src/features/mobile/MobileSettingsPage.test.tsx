import {
    MOBILE_APP_STORE_URL,
    MOBILE_GOOGLE_PLAY_URL,
    MobileSignInCodeStatus,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import MobileAppLandingPage from './MobileAppLandingPage';
import { MobileSettingsPage } from './MobileSettingsPage';
import { useMobileAppLink } from './useMobileAppLink';

vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: { siteUrl: 'https://app.example.com' } }),
}));
vi.mock('./useMobileAppLink', () => ({ useMobileAppLink: vi.fn() }));
vi.mock('../../api');
const qrSignIn = vi.hoisted(() => ({ enabled: false }));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { id: 'mobile-qr-sign-in', enabled: qrSignIn.enabled },
    }),
}));

const SCAN_URL = 'https://app.example.com/m/app/scan-id';
const QR_NAME = 'QR code to install the Lightdash app';
const SIGN_IN_QR_NAME = 'Sign-in QR code';

const signInCalls = (method: string) =>
    mockedLightdashApi.mock.calls.filter(
        ([call]) =>
            call.method === method &&
            call.url.startsWith('/user/mobile/sign-in-codes'),
    );

const mockLink = (overrides: Partial<ReturnType<typeof useMobileAppLink>>) =>
    vi.mocked(useMobileAppLink).mockReturnValue({
        link: {
            linkUuid: 'link-1',
            scanUrl: SCAN_URL,
            expiresAt: '2026-11-09T12:30:00.000Z',
            expiresInSeconds: 1800,
        },
        isScanned: false,
        hasFailed: false,
        retry: vi.fn(),
        ...overrides,
    });

beforeEach(() => {
    vi.mocked(useMobileAppLink).mockReset();
    qrSignIn.enabled = false;
    mockedLightdashApi.mockReset();
    mockedLightdashApi.mockImplementation(
        async ({ method }: { method: string }) => {
            if (method === 'POST') {
                return {
                    codeUuid: 'code-1',
                    signInUrl: 'https://app.example.com/m/sign-in#c=code-1',
                    approvalNonce: 'nonce-1',
                    expiresAt: '2026-11-09T12:02:00.000Z',
                    expiresInSeconds: 120,
                };
            }
            if (method === 'DELETE') return undefined;
            return {
                codeUuid: 'code-1',
                status: MobileSignInCodeStatus.PENDING,
                expiresAt: '2026-11-09T12:02:00.000Z',
                matchNumber: null,
                declinedBy: null,
                device: null,
            };
        },
    );
});

describe('MobileSettingsPage with mobile-qr-sign-in off', () => {
    it('shows QR 1, the store links and the host, with no sign-in step', async () => {
        mockLink({});
        renderWithProviders(<MobileSettingsPage />);

        expect(
            await screen.findByRole('img', { name: QR_NAME }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Download on the App Store' }),
        ).toHaveAttribute('href', MOBILE_APP_STORE_URL);
        expect(
            screen.getByRole('link', { name: 'Get it on Google Play' }),
        ).toHaveAttribute('href', MOBILE_GOOGLE_PLAY_URL);
        expect(screen.getByText('Sign in to')).toBeVisible();
        expect(screen.getByText('app.example.com')).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Copy host' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Sign in on your phone' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'I already have the app' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Show code' }),
        ).not.toBeInTheDocument();
    });

    it('shows Opened on a phone after a scan, still with no sign-in step', () => {
        mockLink({ isScanned: true });
        renderWithProviders(<MobileSettingsPage />);

        expect(screen.getByRole('status')).toHaveTextContent(
            'Opened on a phone',
        );
        expect(screen.getByText('app.example.com')).toBeVisible();
        expect(
            screen.queryByRole('heading', { name: 'Sign in on your phone' }),
        ).not.toBeInTheDocument();
    });

    it('moves focus to the card heading when a scan removes the focused button', async () => {
        mockLink({});
        const { rerender } = renderWithProviders(<MobileSettingsPage />);
        await screen.findByRole('img', { name: QR_NAME });
        screen.getByRole('button', { name: 'Copy link' }).focus();

        mockLink({ isScanned: true });
        rerender(<MobileSettingsPage />);

        expect(
            await screen.findByRole('heading', { name: 'Get the app' }),
        ).toHaveFocus();
    });
});

describe('MobileSettingsPage with mobile-qr-sign-in on', () => {
    beforeEach(() => {
        qrSignIn.enabled = true;
    });

    it('shows the QR code with short labels while waiting', async () => {
        mockLink({});
        renderWithProviders(<MobileSettingsPage />);

        expect(
            await screen.findByRole('img', { name: QR_NAME }),
        ).toBeInTheDocument();
        expect(screen.getByText('Waiting for scan')).toHaveAttribute(
            'aria-live',
            'polite',
        );
        expect(
            screen.queryByText(/Expires|minutes|\d+:\d{2}/),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible();
        expect(screen.queryByText(SCAN_URL)).not.toBeInTheDocument();
        expect(screen.queryByText('Sign in to')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Show sign-in code' }),
        ).not.toBeInTheDocument();
        expect(signInCalls('POST')).toHaveLength(0);
    });

    it('shows the sign-in code without a click and cancels it on the way back', async () => {
        mockLink({});
        renderWithProviders(<MobileSettingsPage />);

        await userEvent.click(
            screen.getByRole('button', { name: 'I already have the app' }),
        );

        expect(screen.getByText('Sign in to')).toBeVisible();
        expect(screen.getByText('app.example.com')).toBeVisible();
        expect(
            screen.queryByRole('img', { name: QR_NAME }),
        ).not.toBeInTheDocument();
        expect(
            await screen.findByRole('img', { name: SIGN_IN_QR_NAME }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Show sign-in code' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Hide code' }),
        ).not.toBeInTheDocument();
        expect(signInCalls('POST')).toHaveLength(1);

        await userEvent.click(
            screen.getByRole('button', { name: 'Show code' }),
        );
        await waitFor(() => expect(signInCalls('DELETE')).toHaveLength(1));

        expect(
            await screen.findByRole('img', { name: QR_NAME }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Get the app' }),
        ).toHaveFocus();
        expect(
            screen.queryByRole('button', { name: 'Show sign-in code' }),
        ).not.toBeInTheDocument();
    });

    it('pauses link polling while the user already has the app', async () => {
        mockLink({});
        renderWithProviders(<MobileSettingsPage />);
        expect(useMobileAppLink).toHaveBeenLastCalledWith({
            isPaused: false,
            enabled: true,
        });

        await userEvent.click(
            screen.getByRole('button', { name: 'I already have the app' }),
        );
        expect(useMobileAppLink).toHaveBeenLastCalledWith({
            isPaused: true,
            enabled: true,
        });

        await userEvent.click(
            screen.getByRole('button', { name: 'Show code' }),
        );
        expect(useMobileAppLink).toHaveBeenLastCalledWith({
            isPaused: false,
            enabled: true,
        });
    });

    it('announces a scan and opens the sign-in step with its code', async () => {
        mockLink({ isScanned: true });
        renderWithProviders(<MobileSettingsPage />);

        expect(screen.getByRole('status')).toHaveTextContent(
            'Opened on a phone',
        );
        expect(screen.getByText('app.example.com')).toBeVisible();
        expect(
            await screen.findByRole('img', { name: SIGN_IN_QR_NAME }),
        ).toBeInTheDocument();
        expect(signInCalls('POST')).toHaveLength(1);
        expect(
            screen.queryByRole('img', { name: QR_NAME }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Show code' }),
        ).not.toBeInTheDocument();
    });

    it('shows a short error with a retry button when a code cannot be created', async () => {
        const retry = vi.fn();
        mockLink({
            link: null,
            retry,
            hasFailed: true,
        });
        renderWithProviders(<MobileSettingsPage />);

        expect(screen.getByText("Couldn't create the code")).toBeVisible();
        expect(
            screen.queryByLabelText('Creating the code'),
        ).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try again' }),
        );
        expect(retry).toHaveBeenCalledOnce();
    });
});

describe('MobileAppLandingPage', () => {
    it('links to both app stores under a page heading', () => {
        renderWithProviders(<MobileAppLandingPage />);

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'Get the Lightdash app',
            }),
        ).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Download on the App Store' }),
        ).toHaveAttribute('href', MOBILE_APP_STORE_URL);
        expect(
            screen.getByRole('link', { name: 'Get it on Google Play' }),
        ).toHaveAttribute('href', MOBILE_GOOGLE_PLAY_URL);
    });
});
