import { MantineProvider } from '@mantine-8/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import AppRoute from './AppRoute';

const state = vi.hoisted(() => ({
    needsProject: true,
    isHomepageBuilderEnabled: true,
    isNewOnboardingEnabled: true,
}));

vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        health: { isInitialLoading: false, error: null, data: {} },
    }),
}));

vi.mock('../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({
        data: { needsProject: state.needsProject },
        isInitialLoading: false,
        isFetchedAfterMount: true,
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
        <QueryClientProvider client={new QueryClient()}>
            <MantineProvider>
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
            </MantineProvider>
        </QueryClientProvider>,
    );

describe('AppRoute', () => {
    beforeEach(() => {
        state.needsProject = true;
        state.isHomepageBuilderEnabled = true;
        state.isNewOnboardingEnabled = true;
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
});
