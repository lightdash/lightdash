import { Ability } from '@casl/ability';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import AppRoute from './AppRoute';

const organizationUuid = '172a2270-000f-42be-9c68-c4752c23ae51';

const state = vi.hoisted(() => ({
    needsProject: true,
    isHomepageBuilderEnabled: true,
    isNewOnboardingEnabled: true,
    canCreateProject: true,
}));

vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        health: { isInitialLoading: false, error: null, data: {} },
        user: {
            isInitialLoading: false,
            data: {
                organizationUuid,
                ability: new Ability(
                    state.canCreateProject
                        ? [
                              {
                                  action: 'create',
                                  subject: 'Project',
                                  conditions: { organizationUuid },
                              },
                          ]
                        : [],
                ),
            },
        },
    }),
}));

vi.mock('../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({
        data: { needsProject: state.needsProject },
        isInitialLoading: false,
        error: null,
    }),
}));

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: state.isNewOnboardingEnabled },
        isLoading: false,
    }),
}));

vi.mock('../ee/features/homepageBuilder/hooks/useProjectHomepage', () => ({
    useHomepageBuilderFlag: () => ({
        isEnabled: state.isHomepageBuilderEnabled,
        isLoading: false,
    }),
}));

const renderAppRoute = () =>
    render(
        <MantineProvider env="test">
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <AppRoute>
                                <div>app</div>
                            </AppRoute>
                        }
                    />
                    <Route
                        path="/get-started"
                        element={<div>get started</div>}
                    />
                    <Route
                        path="/createProject"
                        element={<div>create project</div>}
                    />
                    <Route
                        path="/onboarding/data-source"
                        element={<div>data source</div>}
                    />
                </Routes>
            </MemoryRouter>
        </MantineProvider>,
    );

describe('AppRoute', () => {
    beforeEach(() => {
        state.needsProject = true;
        state.isHomepageBuilderEnabled = true;
        state.isNewOnboardingEnabled = true;
        state.canCreateProject = true;
    });

    it('sends an organization with the homepage builder to the get started page', () => {
        renderAppRoute();

        expect(screen.getByText('get started')).toBeInTheDocument();
    });

    it('sends an organization without the homepage builder to the new data source page', () => {
        state.isHomepageBuilderEnabled = false;
        renderAppRoute();

        expect(screen.getByText('data source')).toBeInTheDocument();
    });

    it('sends an organization without new onboarding to legacy project creation', () => {
        state.isNewOnboardingEnabled = false;
        state.isHomepageBuilderEnabled = false;
        renderAppRoute();

        expect(screen.getByText('create project')).toBeInTheDocument();
    });

    it('keeps legacy project creation when only the enterprise surfaces are enabled', () => {
        state.isNewOnboardingEnabled = false;
        renderAppRoute();

        expect(screen.getByText('create project')).toBeInTheDocument();
    });

    it('renders its children once the organization has a project', () => {
        state.needsProject = false;
        renderAppRoute();

        expect(screen.getByText('app')).toBeInTheDocument();
    });

    it('renders its children for a user who cannot create a project', () => {
        state.canCreateProject = false;
        renderAppRoute();

        expect(screen.getByText('app')).toBeInTheDocument();
        expect(screen.queryByText('get started')).not.toBeInTheDocument();
    });

    it('keeps the legacy project creation redirect away from users who cannot create a project', () => {
        state.canCreateProject = false;
        state.isNewOnboardingEnabled = false;
        state.isHomepageBuilderEnabled = false;
        renderAppRoute();

        expect(screen.getByText('app')).toBeInTheDocument();
        expect(screen.queryByText('create project')).not.toBeInTheDocument();
    });
});
