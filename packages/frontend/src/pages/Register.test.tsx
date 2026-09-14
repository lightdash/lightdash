import { FeatureFlags } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../testing/testUtils';
import Register from './Register';

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

const renderRegister = (hasEmailClient: boolean) =>
    renderWithProviders(
        <MemoryRouter>
            <Register />
        </MemoryRouter>,
        { health: { hasEmailClient } },
    );

describe('Register', () => {
    beforeEach(() => {
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

        expect(
            await screen.findByLabelText(/Email address/),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText(/First name/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Last name/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
    });
});
