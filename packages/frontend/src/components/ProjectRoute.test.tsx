import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import ProjectRoute from './ProjectRoute';

const state = vi.hoisted(() => ({
    useActiveProjectUuid: vi.fn(),
}));

vi.mock('../hooks/useActiveProject', () => ({
    useActiveProjectUuid: state.useActiveProjectUuid,
}));

describe('ProjectRoute', () => {
    beforeEach(() => {
        state.useActiveProjectUuid.mockReset();
    });

    it('redirects a malformed project UUID before resolving the project', () => {
        render(
            <MemoryRouter
                initialEntries={['/projects/3675b69e-8324-4110-bdca']}
            >
                <Routes>
                    <Route
                        path="/projects/:projectUuid"
                        element={
                            <ProjectRoute>
                                <div>project home</div>
                            </ProjectRoute>
                        }
                    />
                    <Route
                        path="/projects"
                        element={<div>project fallback</div>}
                    />
                </Routes>
            </MemoryRouter>,
        );

        expect(screen.getByText('project fallback')).toBeInTheDocument();
        expect(screen.queryByText('project home')).not.toBeInTheDocument();
        expect(state.useActiveProjectUuid).not.toHaveBeenCalled();
    });
});
