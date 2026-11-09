import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { MobileSettingsPage } from './MobileSettingsPage';
import { useMobileAppLink } from './useMobileAppLink';
import { useMobileSignInCode } from './useMobileSignInCode';

vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: { siteUrl: 'https://app.example.com' } }),
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

const scannedLink = {
    link: null,
    isScanned: true,
    mintError: null,
    retry: vi.fn(),
} as unknown as ReturnType<typeof useMobileAppLink>;

describe('MobileSettingsPage sign-in step', () => {
    it('marks step 2 done once a phone is signed in', () => {
        qrSignIn.enabled = true;
        vi.mocked(useMobileAppLink).mockReturnValue(scannedLink);
        vi.mocked(useMobileSignInCode).mockReturnValue(signedIn);
        const { container } = renderWithProviders(<MobileSettingsPage />);

        expect(screen.getByText('Signed in on a phone')).toBeVisible();
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
