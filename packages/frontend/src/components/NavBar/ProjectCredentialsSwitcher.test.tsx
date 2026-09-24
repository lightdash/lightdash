import { type Project } from '@lightdash/common';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProject } from '../../hooks/useProject';
import ProjectCredentialsSwitcher from './ProjectCredentialsSwitcher';

const connectionSwitcher = vi.hoisted(() => ({
    onPreferenceSaved: null as null | (() => void),
}));

vi.mock('../../hooks/useActiveProject', () => ({
    useActiveProjectUuid: () => ({
        activeProjectUuid: 'project-uuid',
        isLoading: false,
    }),
}));

vi.mock('../../hooks/useProject', () => ({
    useProject: vi.fn(),
}));

vi.mock('./UserCredentialsSwitcher', () => ({
    default: () => <div>project credentials switcher</div>,
}));

vi.mock('./ConnectionCredentialsSwitcher', () => ({
    default: ({
        project,
        onPreferenceSaved,
    }: {
        project: Project;
        onPreferenceSaved: () => void;
    }) => {
        connectionSwitcher.onPreferenceSaved = onPreferenceSaved;
        return <div>connection credentials switcher for {project.name}</div>;
    },
}));

const serveProject = (connectionRoute: Project['connectionRoute']) =>
    vi.mocked(useProject).mockReturnValue({
        data: {
            projectUuid: 'project-uuid',
            name: 'Jaffle',
            connectionRoute,
        } as Project,
    } as ReturnType<typeof useProject>);

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <ProjectCredentialsSwitcher />
        </MemoryRouter>,
    );

describe('ProjectCredentialsSwitcher', () => {
    const reload = vi.fn();
    const originalLocation = window.location;

    beforeEach(() => {
        connectionSwitcher.onPreferenceSaved = null;
        reload.mockReset();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { href: originalLocation.href, reload },
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: originalLocation,
        });
    });

    it.each(['single', undefined] as const)(
        'shows the project credentials switcher when the route is %s',
        (connectionRoute) => {
            serveProject(connectionRoute);
            renderAt('/projects/project-uuid/home');

            expect(
                screen.getByText('project credentials switcher'),
            ).toBeInTheDocument();
            expect(
                screen.queryByText(/connection credentials switcher/),
            ).not.toBeInTheDocument();
        },
    );

    it('shows the per-connection switcher when the project routes multi', () => {
        serveProject('multi');
        renderAt('/projects/project-uuid/home');

        expect(
            screen.getByText('connection credentials switcher for Jaffle'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('project credentials switcher'),
        ).not.toBeInTheDocument();
    });

    it.each([
        ['/projects/project-uuid/tables/orders', 1],
        ['/projects/project-uuid/sqlRunner', 1],
        ['/projects/project-uuid/home', 0],
    ])('a saved choice on %s reloads the page %i times', (path, reloads) => {
        serveProject('multi');
        renderAt(path);

        connectionSwitcher.onPreferenceSaved?.();

        expect(reload).toHaveBeenCalledTimes(reloads);
    });
});
