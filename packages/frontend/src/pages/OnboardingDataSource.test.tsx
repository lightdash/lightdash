import { FeatureFlags, type HealthState } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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

describe('OnboardingDataSource', () => {
    beforeEach(() => {
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { id: FeatureFlags.NewOnboarding, enabled: true },
            isLoading: false,
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    it('advertises google sign-in for BigQuery when google auth is configured', async () => {
        renderDataSourcePicker(true);

        expect(
            await screen.findByText('Sign in with Google to connect'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Connect with a service account'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Connect with SSO')).toBeInTheDocument();
    });

    it('advertises a service account for BigQuery when google auth is not configured', async () => {
        renderDataSourcePicker(false);

        expect(
            await screen.findByText('Connect with a service account'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Sign in with Google to connect'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Connect with SSO')).toBeInTheDocument();
    });
});
