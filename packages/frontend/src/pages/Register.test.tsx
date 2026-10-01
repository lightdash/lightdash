import { FeatureFlags } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../testing/testUtils';
import Register from './Register';

const emailStatus = vi.hoisted(() => ({ isVerified: true }));

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

vi.mock('../hooks/useEmailVerification', () => ({
    useEmailStatus: () => ({
        data: { isVerified: emailStatus.isVerified },
        isInitialLoading: false,
    }),
}));

const renderRegister = (hasEmailClient: boolean) =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/register']}>
            <Routes>
                <Route path="/register" element={<Register />} />
                <Route path="/verify-email" element={<p>Verify page</p>} />
            </Routes>
        </MemoryRouter>,
        { health: { hasEmailClient } },
    );

describe('Register', () => {
    beforeEach(() => {
        emailStatus.isVerified = true;
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { id: FeatureFlags.NewOnboarding, enabled: true },
            isLoading: false,
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    it('renders the classic signup form without an email client', async () => {
        renderRegister(false);

        expect(await screen.findByLabelText(/First name/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Last name/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
    });

    it('renders the email-only signup form with an email client', async () => {
        renderRegister(true);

        expect(await screen.findByLabelText(/Work email/)).toBeInTheDocument();
        expect(screen.queryByLabelText(/First name/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Last name/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
    });

    it('sends an unverified session to the verify email page', async () => {
        emailStatus.isVerified = false;
        renderRegister(true);

        expect(await screen.findByText('Verify page')).toBeInTheDocument();
        expect(screen.queryByLabelText(/Work email/)).not.toBeInTheDocument();
    });
});
