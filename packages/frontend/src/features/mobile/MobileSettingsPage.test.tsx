import {
    MOBILE_APP_STORE_URL,
    MOBILE_GOOGLE_PLAY_URL,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { MobileSettingsPage } from './MobileSettingsPage';

vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: { siteUrl: 'https://app.example.com' } }),
}));

describe('MobileSettingsPage', () => {
    it('links to both app stores and names the instance to sign in to', () => {
        renderWithProviders(<MobileSettingsPage />);

        expect(
            screen.getByRole('link', { name: 'Download on the App Store' }),
        ).toHaveAttribute('href', MOBILE_APP_STORE_URL);
        expect(
            screen.getByRole('link', { name: 'Get it on Google Play' }),
        ).toHaveAttribute('href', MOBILE_GOOGLE_PLAY_URL);
        expect(screen.getByText('app.example.com')).toBeVisible();
    });
});
