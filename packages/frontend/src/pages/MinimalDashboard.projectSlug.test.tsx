import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const PROJECT_UUID = '3675b69e-8324-4110-bdca-059031aa8da3';
const DASHBOARD_UUID = 'a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6';

const state = vi.hoisted(() => ({
    useDashboardQuery: vi.fn(),
    useProject: vi.fn(),
    useProjects: vi.fn(),
}));

vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({}),
}));

vi.mock('../features/scheduler/hooks/useScheduler', () => ({
    useScheduler: () => ({
        data: undefined,
        isError: false,
        error: undefined,
    }),
}));

vi.mock('../hooks/dashboard/useDashboard', () => ({
    useDashboardQuery: state.useDashboardQuery,
}));

vi.mock('../hooks/useProject', () => ({
    useProject: state.useProject,
}));

vi.mock('../hooks/useProjects', () => ({
    useProjects: state.useProjects,
}));

// eslint-disable-next-line import/first
import MinimalDashboard from './MinimalDashboard';

const renderMinimalDashboard = (projectIdentifier: string) =>
    render(
        <MantineProvider>
            <MemoryRouter
                initialEntries={[
                    `/minimal/projects/${projectIdentifier}/dashboards/${DASHBOARD_UUID}`,
                ]}
            >
                <Routes>
                    <Route
                        path="/minimal/projects/:projectUuid/dashboards/:dashboardUuid"
                        element={<MinimalDashboard />}
                    />
                </Routes>
            </MemoryRouter>
        </MantineProvider>,
    );

describe('MinimalDashboard project routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.useProjects.mockReturnValue({
            data: [{ projectUuid: PROJECT_UUID, slug: 'jaffle-shop' }],
            isInitialLoading: false,
            isError: false,
            error: undefined,
        });
        state.useProject.mockReturnValue({
            data: {
                projectUuid: PROJECT_UUID,
                slug: 'jaffle-shop',
            },
            isInitialLoading: false,
            isError: false,
            error: undefined,
        });
        state.useDashboardQuery.mockReturnValue({
            data: undefined,
            isError: false,
            error: undefined,
        });
    });

    it('resolves a project slug before loading the dashboard', () => {
        renderMinimalDashboard('jaffle-shop');

        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(state.useProjects).toHaveBeenCalledWith({ enabled: true });
        expect(state.useProject).toHaveBeenCalledWith(PROJECT_UUID);
        expect(state.useDashboardQuery).toHaveBeenCalledWith({
            uuidOrSlug: DASHBOARD_UUID,
            projectUuid: PROJECT_UUID,
        });
    });

    it('keeps UUID routes working without loading the project list', () => {
        renderMinimalDashboard(PROJECT_UUID);

        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(state.useProjects).toHaveBeenCalledWith({ enabled: false });
        expect(state.useProject).toHaveBeenCalledWith(undefined);
        expect(state.useDashboardQuery).toHaveBeenCalledWith({
            uuidOrSlug: DASHBOARD_UUID,
            projectUuid: PROJECT_UUID,
        });
    });

    it('does not request a dashboard when the project slug is unknown', () => {
        state.useProjects.mockReturnValue({
            data: [],
            isInitialLoading: false,
            isError: false,
            error: undefined,
        });

        renderMinimalDashboard('missing-project');

        expect(
            screen.getByText('Cannot find project: missing-project'),
        ).toBeInTheDocument();
        expect(state.useProject).toHaveBeenCalledWith(undefined);
        expect(state.useDashboardQuery).not.toHaveBeenCalled();
    });
});
