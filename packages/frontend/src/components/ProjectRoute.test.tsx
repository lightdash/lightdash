import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useOptionalProjectRoute } from '../hooks/useProjectRoute';
import ProjectRoute from './ProjectRoute';

const PROJECT_UUID = '3675b69e-8324-4110-bdca-059031aa8da3';

const state = vi.hoisted(() => ({
    useActiveProjectUuid: vi.fn(),
    useProject: vi.fn(),
    useProjects: vi.fn(),
}));

vi.mock('../hooks/useActiveProject', () => ({
    useActiveProjectUuid: state.useActiveProjectUuid,
}));

vi.mock('../hooks/useProject', () => ({
    useProject: state.useProject,
}));

vi.mock('../hooks/useProjects', () => ({
    useProjects: state.useProjects,
}));

vi.mock('../providers/App/useApp', () => ({
    default: () => ({ user: { data: { organizationUuid: 'org-uuid' } } }),
}));

vi.mock('../providers/Ability', () => ({
    Can: ({ children }: { children: (allowed: boolean) => React.ReactNode }) =>
        children(true),
}));

const ProjectDetails = () => {
    const projectRoute = useOptionalProjectRoute();

    return (
        <div>
            {projectRoute?.projectUuid}:{projectRoute?.projectUrlIdentifier}
        </div>
    );
};

const renderProjectRoute = (projectIdentifier: string) =>
    render(
        <MemoryRouter initialEntries={[`/projects/${projectIdentifier}`]}>
            <Routes>
                <Route
                    path="/projects/:projectUuid"
                    element={
                        <ProjectRoute>
                            <ProjectDetails />
                        </ProjectRoute>
                    }
                />
                <Route path="/projects" element={<div>project fallback</div>} />
            </Routes>
        </MemoryRouter>,
    );

describe('ProjectRoute', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.useActiveProjectUuid.mockReturnValue({
            activeProjectUuid: PROJECT_UUID,
            isLoading: false,
        });
        state.useProject.mockReturnValue({
            data: {
                projectUuid: PROJECT_UUID,
                slug: 'jaffle-shop',
            },
            isError: false,
        });
        state.useProjects.mockReturnValue({
            data: [{ projectUuid: PROJECT_UUID, slug: 'jaffle-shop' }],
            isInitialLoading: false,
            isError: false,
        });
    });

    it('keeps UUID routes working without resolving the project list', () => {
        renderProjectRoute(PROJECT_UUID);

        expect(
            screen.getByText(`${PROJECT_UUID}:jaffle-shop`),
        ).toBeInTheDocument();
        expect(state.useProjects).toHaveBeenCalledWith({ enabled: false });
        expect(state.useProject).toHaveBeenCalledWith(PROJECT_UUID);
    });

    it('resolves a project slug to the canonical project UUID', () => {
        renderProjectRoute('jaffle-shop');

        expect(
            screen.getByText(`${PROJECT_UUID}:jaffle-shop`),
        ).toBeInTheDocument();
        expect(state.useProjects).toHaveBeenCalledWith({ enabled: true });
        expect(state.useProject).toHaveBeenCalledWith(PROJECT_UUID);
    });

    it('redirects when a project slug cannot be resolved', () => {
        state.useProjects.mockReturnValue({
            data: [],
            isInitialLoading: false,
            isError: false,
        });

        renderProjectRoute('missing-project');

        expect(screen.getByText('project fallback')).toBeInTheDocument();
        expect(state.useProject).not.toHaveBeenCalled();
    });
});
