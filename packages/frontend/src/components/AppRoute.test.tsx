import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import AppRoute from './AppRoute';

const state = vi.hoisted(() => ({
    needsProject: true,
    isCopilotEnabled: true,
    isCopilotLoading: false,
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
        error: null,
    }),
}));

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: state.isNewOnboardingEnabled },
        isLoading: false,
    }),
}));

vi.mock('../ee/features/aiCopilot/hooks/useIsCopilotEnabled', () => ({
    useIsCopilotEnabled: () => ({
        isCopilotEnabled: state.isCopilotEnabled,
        isLoading: state.isCopilotLoading,
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
                </Routes>
            </MemoryRouter>
        </MantineProvider>,
    );

describe('AppRoute', () => {
    beforeEach(() => {
        state.needsProject = true;
        state.isCopilotEnabled = true;
        state.isCopilotLoading = false;
        state.isHomepageBuilderEnabled = true;
        state.isNewOnboardingEnabled = true;
    });

    it('sends a copilot-enabled organization to the day one homepage', () => {
        renderAppRoute();

        expect(screen.getByText('get started')).toBeInTheDocument();
    });

    it('sends a copilot-less organization straight to project creation', () => {
        state.isCopilotEnabled = false;
        renderAppRoute();

        expect(screen.getByText('create project')).toBeInTheDocument();
    });

    it('waits for the copilot signal before routing', () => {
        state.isCopilotEnabled = false;
        state.isCopilotLoading = true;
        renderAppRoute();

        expect(screen.queryByText('create project')).toBeNull();
        expect(screen.queryByText('get started')).toBeNull();
    });

    it('renders its children once the organization has a project', () => {
        state.needsProject = false;
        renderAppRoute();

        expect(screen.getByText('app')).toBeInTheDocument();
    });
});
