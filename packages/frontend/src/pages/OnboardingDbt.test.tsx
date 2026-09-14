import { FeatureFlags, type HealthState } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProject } from '../hooks/useProject';
import { useProjects } from '../hooks/useProjects';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../testing/testUtils';
import OnboardingDbt from './OnboardingDbt';

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

vi.mock('../hooks/useProjects', () => ({
    useProjects: vi.fn(),
}));

vi.mock('../hooks/useProject', () => ({
    useProject: vi.fn(),
}));

vi.mock('../hooks/useActiveProject', () => ({
    useActiveProjectUuid: () => ({
        activeProjectUuid: 'project-1',
        isLoading: false,
    }),
}));

const health = (overrides?: Partial<HealthState>): Partial<HealthState> => ({
    siteUrl: 'https://lightdash.example.com',
    version: '1.51.0',
    ...overrides,
});

const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}</div>;
};

const renderAt = (path: string, healthOverrides?: Partial<HealthState>) =>
    renderWithProviders(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route
                    path="/onboarding/dbt/:method?"
                    element={<OnboardingDbt />}
                />
                <Route path="/get-started" element={<LocationProbe />} />
                <Route
                    path="/generalSettings/integrations"
                    element={<LocationProbe />}
                />
            </Routes>
        </MemoryRouter>,
        { health: health(healthOverrides) },
    );

const mockProjects = (projectUuids: string[]) => {
    vi.mocked(useProjects).mockReturnValue({
        data: projectUuids.map((projectUuid) => ({ projectUuid })),
    } as unknown as ReturnType<typeof useProjects>);
};

describe('OnboardingDbt', () => {
    beforeEach(() => {
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { id: FeatureFlags.NewOnboarding, enabled: true },
            isLoading: false,
        } as ReturnType<typeof useServerFeatureFlag>);
        mockProjects(['project-1']);
        vi.mocked(useProject).mockReturnValue({
            data: undefined,
        } as unknown as ReturnType<typeof useProject>);
    });

    it('offers both setup paths and a docs link on the choice screen', async () => {
        renderAt('/onboarding/dbt');

        expect(
            await screen.findByText("Let's get you set up!"),
        ).toBeInTheDocument();
        expect(screen.getByText('Using your CLI')).toBeInTheDocument();
        expect(screen.getByText('with lightdash deploy')).toBeInTheDocument();
        expect(screen.getByText('Manually')).toBeInTheDocument();
        expect(
            screen.getByText('Pull project from git repository'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'View docs' }),
        ).toBeInTheDocument();
    });

    it('shows the CLI commands with the site url and version substituted', async () => {
        renderAt('/onboarding/dbt/cli');

        expect(await screen.findByText('Waiting for data')).toBeInTheDocument();
        expect(
            screen.getByText('npm install -g @lightdash/cli@1.51.0'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('lightdash login https://lightdash.example.com'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('lightdash deploy --create'),
        ).toBeInTheDocument();
    });

    it('redirects to get-started once a new project is detected', async () => {
        const { rerender } = renderAt('/onboarding/dbt/cli');

        expect(await screen.findByText('Waiting for data')).toBeInTheDocument();

        mockProjects(['project-1', 'project-2']);
        rerender(
            <MemoryRouter initialEntries={['/onboarding/dbt/cli']}>
                <Routes>
                    <Route
                        path="/onboarding/dbt/:method?"
                        element={<OnboardingDbt />}
                    />
                    <Route path="/get-started" element={<LocationProbe />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() =>
            expect(screen.getByTestId('location')).toHaveTextContent(
                '/get-started',
            ),
        );
    });

    it('sends an unknown method back to the choice screen', async () => {
        renderAt('/onboarding/dbt/nonsense');

        expect(
            await screen.findByText("Let's get you set up!"),
        ).toBeInTheDocument();
    });
});
