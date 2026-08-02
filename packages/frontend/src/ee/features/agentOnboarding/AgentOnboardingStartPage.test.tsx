import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import AgentOnboardingStartPage from './AgentOnboardingStartPage';

const state = vi.hoisted(() => ({
    isFlagEnabled: true,
    project: {
        projectUuid: 'project-uuid',
        warehouseConnection: { type: 'postgres' },
    } as unknown,
}));

vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: state.project, isInitialLoading: false }),
}));

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: state.isFlagEnabled },
        isInitialLoading: false,
    }),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        health: {
            data: { siteUrl: 'https://app.lightdash.test' },
            isInitialLoading: false,
        },
    }),
}));

vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

vi.mock('../aiCopilot/hooks/useIsCopilotEnabled', () => ({
    useIsCopilotEnabled: () => ({ isCopilotEnabled: true, isLoading: false }),
}));

vi.mock('./hooks/useAgentOnboarding', () => ({
    useStartAgentOnboardingRun: () => ({
        mutateAsync: vi.fn(),
        isLoading: false,
    }),
}));

vi.mock('../../../components/common/Page/Page', () => ({
    default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

const renderPage = () =>
    render(
        <MantineProvider>
            <MemoryRouter
                initialEntries={['/projects/project-uuid/onboarding/agent']}
            >
                <Routes>
                    <Route
                        path="/projects/:projectUuid/onboarding/agent"
                        element={<AgentOnboardingStartPage />}
                    />
                    <Route
                        path="/generalSettings/projectManagement/:projectUuid/settings"
                        element={<div>project settings</div>}
                    />
                </Routes>
            </MemoryRouter>
        </MantineProvider>,
    );

describe('AgentOnboardingStartPage', () => {
    beforeEach(() => {
        state.isFlagEnabled = true;
        state.project = {
            projectUuid: 'project-uuid',
            warehouseConnection: { type: 'postgres' },
        };
    });

    it('renders the launch panel for a project with a warehouse connection', () => {
        renderPage();

        expect(
            screen.getByText('Let Lightdash build it for you'),
        ).toBeInTheDocument();
        expect(screen.getByText('Run it for me')).toBeInTheDocument();
    });

    it('redirects to project settings when the flag is disabled', () => {
        state.isFlagEnabled = false;

        renderPage();

        expect(screen.getByText('project settings')).toBeInTheDocument();
    });

    it('redirects to project settings when the project has no warehouse connection', () => {
        state.project = { projectUuid: 'project-uuid' };

        renderPage();

        expect(screen.getByText('project settings')).toBeInTheDocument();
    });
});
