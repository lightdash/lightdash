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

    it('shows the popular warehouses first and reveals the rest on request', async () => {
        renderDataSourcePicker(false);

        expect(await screen.findByText('BigQuery')).toBeInTheDocument();
        expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
        expect(screen.queryByText('Redshift')).not.toBeInTheDocument();

        await userEvent.click(screen.getByText('Show all warehouses'));

        expect(screen.getByText('Redshift')).toBeInTheDocument();
        expect(
            screen.queryByText('Show all warehouses'),
        ).not.toBeInTheDocument();
    });

    it('sends a user who cannot create a project to the no access page', async () => {
        renderWithoutProjectCreation();

        expect(await screen.findByText('no access')).toBeInTheDocument();
        expect(screen.queryByText('home')).not.toBeInTheDocument();
    });
});
