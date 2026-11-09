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

describe('MobileSettingsPage sign-in step', () => {
    it('marks step 2 done once a phone is signed in', () => {
        vi.mocked(useMobileAppLink).mockReturnValue({
            link: null,
            isScanned: true,
            mintError: null,
            retry: vi.fn(),
        } as unknown as ReturnType<typeof useMobileAppLink>);
        vi.mocked(useMobileSignInCode).mockReturnValue({
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
        });
        const { container } = renderWithProviders(<MobileSettingsPage />);

        expect(screen.getByText('Signed in on a phone')).toBeVisible();
        expect(container.querySelectorAll('[data-state="done"]')).toHaveLength(
            2,
        );
    });
});
