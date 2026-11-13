import { LightdashMode } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { MobileSettingsPage } from './MobileSettingsPage';
import { MOBILE_SIGN_IN_STRINGS } from './mobileStrings';
import { useMobileAppLink } from './useMobileAppLink';
import { useMobileSignInCode } from './useMobileSignInCode';

const health = vi.hoisted<{ mode: string | null }>(() => ({ mode: 'default' }));
vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({
        data:
            health.mode === null
                ? undefined
                : { siteUrl: 'https://app.example.com', mode: health.mode },
    }),
}));
vi.mock('./useMobileAppLink', () => ({ useMobileAppLink: vi.fn() }));
vi.mock('./useMobileSignInCode', () => ({ useMobileSignInCode: vi.fn() }));
const qrSignIn = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { id: 'mobile-qr-sign-in', enabled: qrSignIn.enabled },
    }),
}));

const signedIn: ReturnType<typeof useMobileSignInCode> = {
    phase: 'redeemed',
    code: null,
    state: null,
    refusal: null,
    mintError: null,
    isRefreshed: false,
    isMinting: false,
    isDeciding: false,
    show: vi.fn(),
    hide: vi.fn(),
    approve: vi.fn(),
    decline: vi.fn(),
};

const scannedLink: ReturnType<typeof useMobileAppLink> = {
    link: {
        linkUuid: 'link-0000-test',
        scanUrl: 'https://app.example.com/m/app/scan-0000-test',
        expiresAt: '2026-11-09T12:30:00.000Z',
        expiresInSeconds: 1800,
    },
    isScanned: true,
    hasFailed: false,
    retry: vi.fn(),
};

describe('MobileSettingsPage sign-in step', () => {
    beforeEach(() => {
        health.mode = LightdashMode.DEFAULT;
        qrSignIn.enabled = true;
    });

    it('renders no setup flow while the instance mode loads', () => {
        health.mode = null;
        vi.mocked(useMobileAppLink).mockReturnValue(scannedLink);
        vi.mocked(useMobileSignInCode).mockClear();
        renderWithProviders(<MobileSettingsPage />);

        expect(
            screen.queryByRole('heading', { name: 'Get the app' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Sign in on your phone' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(useMobileAppLink).toHaveBeenLastCalledWith({
            isPaused: false,
            enabled: false,
        });
        expect(useMobileSignInCode).not.toHaveBeenCalled();
    });

    it('shows only the sign-in code on Cloud and pauses install codes', () => {
        health.mode = LightdashMode.CLOUD_BETA;
        vi.mocked(useMobileAppLink).mockReturnValue({
            ...scannedLink,
            isScanned: false,
        });
        vi.mocked(useMobileSignInCode).mockReturnValue({
            ...signedIn,
            phase: 'showing',
            code: {
                codeUuid: 'code-1',
                signInUrl: 'https://app.example.com/m/sign-in#c=code-1',
                approvalNonce: 'nonce-1',
                expiresAt: '2026-11-09T12:02:00.000Z',
                expiresInSeconds: 120,
            },
        });
        renderWithProviders(<MobileSettingsPage />);

        expect(screen.getByText('Sign in on your phone')).toBeVisible();
        expect(screen.queryByText('Get the app')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'I already have the app' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText(MOBILE_SIGN_IN_STRINGS.installHint),
        ).toBeVisible();
        expect(useMobileSignInCode).toHaveBeenLastCalledWith({
            autoShow: true,
        });
        expect(useMobileAppLink).toHaveBeenLastCalledWith({
            isPaused: false,
            enabled: false,
        });
    });

    it('keeps the install step on Cloud when QR sign-in is off', () => {
        health.mode = LightdashMode.CLOUD_BETA;
        qrSignIn.enabled = false;
        vi.mocked(useMobileAppLink).mockReturnValue(scannedLink);
        vi.mocked(useMobileSignInCode).mockClear();
        renderWithProviders(<MobileSettingsPage />);

        expect(screen.getByText('Get the app')).toBeVisible();
        expect(useMobileSignInCode).not.toHaveBeenCalled();
        expect(useMobileAppLink).toHaveBeenLastCalledWith({
            isPaused: false,
            enabled: true,
        });
    });

    it('marks step 2 done once a phone is signed in', () => {
        qrSignIn.enabled = true;
        vi.mocked(useMobileAppLink).mockReturnValue(scannedLink);
        vi.mocked(useMobileSignInCode).mockReturnValue(signedIn);
        const { container } = renderWithProviders(<MobileSettingsPage />);

        expect(screen.getByText('Signed in on a phone')).toBeVisible();
        expect(useMobileSignInCode).toHaveBeenLastCalledWith({
            autoShow: true,
        });
        expect(container.querySelectorAll('[data-state="done"]')).toHaveLength(
            2,
        );
    });

    it('shows no sign-in step, code or dialog with mobile-qr-sign-in off', () => {
        qrSignIn.enabled = false;
        vi.mocked(useMobileAppLink).mockReturnValue(scannedLink);
        vi.mocked(useMobileSignInCode).mockClear();
        vi.mocked(useMobileSignInCode).mockReturnValue({
            ...signedIn,
            phase: 'claimed',
        });
        renderWithProviders(<MobileSettingsPage />);

        expect(
            screen.queryByText('Sign in on your phone'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Show sign-in code' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(useMobileSignInCode).not.toHaveBeenCalled();
        expect(screen.getByText('Get the app')).toBeVisible();
    });
});
