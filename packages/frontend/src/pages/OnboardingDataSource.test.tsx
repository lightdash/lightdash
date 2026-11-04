import { FeatureFlags, type HealthState } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../testing/testUtils';
import OnboardingDataSource from './OnboardingDataSource';

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

const healthWithGoogleAuth = (enabled: boolean): Partial<HealthState> => ({
    auth: {
        disablePasswordAuthentication: false,
        google: {
            oauth2ClientId: enabled ? 'client-id' : undefined,
            loginPath: '/login/google',
            googleDriveApiKey: undefined,
            enabled,
            enableGCloudADC: false,
        },
        okta: { enabled: false, loginPath: '/login/okta' },
        oneLogin: { enabled: false, loginPath: '/login/oneLogin' },
        azuread: { enabled: false, loginPath: '/login/azuread' },
        oidc: { enabled: false, loginPath: '/login/oidc' },
        pat: { maxExpirationTimeInDays: undefined },
        snowflake: { enabled: false },
        snowflakeAi: { enabled: false },
        databricks: { enabled: false },
    },
});

const renderDataSourcePicker = (isGoogleAuthEnabled: boolean) =>
    renderWithProviders(
        <MemoryRouter>
            <OnboardingDataSource />
        </MemoryRouter>,
        { health: healthWithGoogleAuth(isGoogleAuthEnabled) },
    );

const renderWithoutProjectCreation = () =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/onboarding/data-source']}>
            <Routes>
                <Route
                    path="/onboarding/data-source"
                    element={<OnboardingDataSource />}
                />
                <Route path="/" element={<div>home</div>} />
                <Route path="/no-access" element={<div>no access</div>} />
            </Routes>
        </MemoryRouter>,
        {
            health: healthWithGoogleAuth(false),
            user: { abilityRules: [] },
        },
    );

describe('OnboardingDataSource', () => {
    beforeEach(() => {
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { id: FeatureFlags.NewOnboarding, enabled: true },
            isLoading: false,
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    it('asks for the warehouse and model setup on one screen', async () => {
        renderDataSourcePicker(false);

        const continueButton = await screen.findByRole('button', {
            name: 'Continue',
        });
        expect(screen.getByText('BigQuery')).toBeInTheDocument();
        expect(
            screen.getByRole('radiogroup', {
                name: 'How should we set up your models?',
            }),
        ).toBeInTheDocument();
        expect(continueButton).toBeDisabled();

        await userEvent.click(
            screen.getByRole('radio', { name: /PostgreSQL/ }),
        );
        expect(continueButton).toBeDisabled();

        await userEvent.click(
            screen.getByRole('radio', { name: /From my tables/ }),
        );
        expect(continueButton).toBeEnabled();
    });

    it('sends a user who cannot create a project to the no access page', async () => {
        renderWithoutProjectCreation();

        expect(await screen.findByText('no access')).toBeInTheDocument();
        expect(screen.queryByText('home')).not.toBeInTheDocument();
    });
});
