import { FeatureFlags, type HealthState } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExternalConnections } from '../features/externalConnections/hooks/useExternalConnections';
import { useExternalSources } from '../features/externalSources/hooks/useExternalSources';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../testing/testUtils';
import OnboardingTools from './OnboardingTools';

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));
vi.mock('../features/externalConnections/hooks/useExternalConnections', () => ({
    useExternalConnections: vi.fn(),
}));
vi.mock(
    '../features/externalSources/hooks/useExternalSources',
    async (importOriginal) => ({
        ...(await importOriginal<object>()),
        useExternalSources: vi.fn(),
    }),
);

const ORG_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';

const mockFlags = (enabled: Partial<Record<string, boolean>>) =>
    vi.mocked(useServerFeatureFlag).mockImplementation(
        (flag) =>
            ({
                data: {
                    id: flag,
                    enabled:
                        flag === FeatureFlags.NewOnboarding ||
                        (enabled[flag] ?? false),
                },
                isLoading: false,
            }) as ReturnType<typeof useServerFeatureFlag>,
    );

const renderPage = (health: Partial<HealthState>) =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/onboarding/tools/project-1']}>
            <Routes>
                <Route
                    path="/onboarding/tools/:projectUuid"
                    element={<OnboardingTools />}
                />
                <Route
                    path="/projects/:projectUuid/home"
                    element={<div>project home</div>}
                />
            </Routes>
        </MemoryRouter>,
        {
            health,
            user: {
                abilityRules: [
                    {
                        action: 'manage',
                        subject: 'ExternalConnection',
                        conditions: { organizationUuid: ORG_UUID },
                    },
                    {
                        action: 'manage',
                        subject: 'ExternalSource',
                        conditions: { organizationUuid: ORG_UUID },
                    },
                ],
            },
        },
    );

describe('OnboardingTools', () => {
    beforeEach(() => {
        vi.mocked(useExternalConnections).mockReturnValue({
            data: [],
        } as unknown as ReturnType<typeof useExternalConnections>);
        vi.mocked(useExternalSources).mockReturnValue({
            data: [],
        } as unknown as ReturnType<typeof useExternalSources>);
    });

    it('offers every enabled group and lets the user skip', async () => {
        mockFlags({
            [FeatureFlags.ApiQuerySources]: true,
            [FeatureFlags.ExternalSources]: true,
        });
        renderPage({ hasGoogleLiveSources: true });

        expect(
            await screen.findByText('Connect the tools your team uses'),
        ).toBeInTheDocument();
        expect(screen.getByText('PostHog')).toBeInTheDocument();
        expect(screen.getByText('Google Analytics 4')).toBeInTheDocument();
        expect(screen.getByText('CSV or Google Sheet')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Skip for now' }),
        ).toBeInTheDocument();
    });

    it('hides Google sources when Google sign-in is not configured', async () => {
        mockFlags({ [FeatureFlags.ApiQuerySources]: true });
        renderPage({ hasGoogleLiveSources: false });

        expect(await screen.findByText('PostHog')).toBeInTheDocument();
        expect(
            screen.queryByText('Google Analytics 4'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('CSV or Google Sheet'),
        ).not.toBeInTheDocument();
    });

    it('goes straight to the project home when no source kind is enabled', async () => {
        mockFlags({});
        renderPage({ hasGoogleLiveSources: true });

        expect(await screen.findByText('project home')).toBeInTheDocument();
    });
});
