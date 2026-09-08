import { Ability } from '@casl/ability';
import { ProjectType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventName } from '../../types/Events';
import { buildLearnCatalogue } from './catalogue';
import LearnPage from './LearnPage';
import type * as LearnRoles from './roles';

const {
    track,
    projectState,
    healthState,
    availabilityState,
    rolesState,
    userState,
} = vi.hoisted(() => ({
    track: vi.fn(),
    projectState: { current: [] as unknown[] },
    healthState: { current: { learn: { enabled: true } } },
    availabilityState: { current: { isSettled: true } },
    rolesState: { current: [] as unknown[] },
    userState: {
        current: { role: 'admin', roleUuid: undefined as string | undefined },
    },
}));

vi.mock('react-router', () => ({
    Navigate: () => null,
}));

vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: {
                organizationUuid: 'org-1',
                role: userState.current.role,
                roleUuid: userState.current.roleUuid,
                ability: new Ability([
                    { action: 'manage', subject: 'Organization' },
                ]),
            },
        },
    }),
}));

// The org's own roles come from the instance; the views built from them are
// the real ones.
vi.mock('./roles', async (importOriginal) => ({
    ...(await importOriginal<typeof LearnRoles>()),
    useLearnRoles: () => ({ data: rolesState.current }),
}));

vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: healthState.current }),
}));

vi.mock('../../hooks/useProjects', () => ({
    useProjects: () => ({ data: projectState.current }),
}));

vi.mock('../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
}));

// The real gates ask the licence and the AI settings; the library's own
// counting is what is under test, so every module is open here, and the
// tests decide whether the gates have answered yet.
vi.mock('./availability', () => ({
    useLearnAvailability: () => ({
        isOpen: () => true,
        isSettled: availabilityState.current.isSettled,
    }),
}));

vi.mock('./useEnableLearn', () => ({
    useEnableLearn: () => ({ mutate: vi.fn(), isLoading: false, error: null }),
}));

vi.mock('./useStartWalkthrough', () => ({
    useStartWalkthrough: () => ({ start: vi.fn(), opening: null }),
}));

vi.mock('./thumbnails', () => ({
    thumbnailFor: () => undefined,
}));

const catalogue = buildLearnCatalogue();
const scopes = catalogue.map((module) => module.scope);

const renderPage = () =>
    render(
        <MantineProvider env="test">
            <LearnPage />
        </MantineProvider>,
    );

const viewEvents = () =>
    track.mock.calls
        .map(([event]) => event)
        .filter((event) => event.name === EventName.LEARN_LIBRARY_VIEWED);

describe('LearnPage analytics', () => {
    beforeEach(() => {
        localStorage.clear();
        track.mockClear();
        healthState.current = { learn: { enabled: true } };
        availabilityState.current = { isSettled: true };
        rolesState.current = [];
        userState.current = { role: 'admin', roleUuid: undefined };
        projectState.current = [
            { projectUuid: 'training-1', type: ProjectType.TRAINING },
        ];
    });

    it('records one view per mount, with the progress the learner is looking at', () => {
        localStorage.setItem(
            'lightdash.learn.started',
            JSON.stringify([scopes[0], scopes[1]]),
        );
        localStorage.setItem(
            'lightdash.learn.completed',
            JSON.stringify([scopes[0]]),
        );

        const { rerender } = renderPage();
        rerender(
            <MantineProvider env="test">
                <LearnPage />
            </MantineProvider>,
        );

        expect(viewEvents()).toEqual([
            {
                name: EventName.LEARN_LIBRARY_VIEWED,
                properties: {
                    organizationUuid: 'org-1',
                    trainingProjectUuid: 'training-1',
                    hasTrainingProject: true,
                    moduleCount: catalogue.length,
                    startedCount: 2,
                    completedCount: 1,
                },
            },
        ]);
    });

    it('counts only the scopes this instance has modules for', () => {
        localStorage.setItem(
            'lightdash.learn.completed',
            JSON.stringify([scopes[0], 'manage:SomethingRetired']),
        );

        renderPage();

        expect(viewEvents()[0].properties).toMatchObject({
            completedCount: 1,
        });
    });

    it('records the call to action before an admin has enabled Learn', () => {
        projectState.current = [
            { projectUuid: 'other-1', type: ProjectType.DEFAULT },
        ];

        renderPage();

        expect(viewEvents()[0].properties).toMatchObject({
            trainingProjectUuid: null,
            hasTrainingProject: false,
        });
    });

    it('waits for the catalogue gates to answer before counting', () => {
        availabilityState.current = { isSettled: false };
        const { rerender } = renderPage();
        expect(viewEvents()).toEqual([]);

        availabilityState.current = { isSettled: true };
        rerender(
            <MantineProvider env="test">
                <LearnPage />
            </MantineProvider>,
        );

        expect(viewEvents()).toHaveLength(1);
    });

    it('records nothing when Learn is switched off for the instance', () => {
        healthState.current = { learn: { enabled: false } };

        renderPage();

        expect(viewEvents()).toEqual([]);
    });
});

describe('LearnPage role views', () => {
    const analyst = {
        roleUuid: 'role-1',
        name: 'Analyst',
        scopes: ['view:Dashboard', 'manage:Validation'],
    };

    beforeEach(() => {
        localStorage.clear();
        track.mockClear();
        healthState.current = { learn: { enabled: true } };
        availabilityState.current = { isSettled: true };
        rolesState.current = [];
        userState.current = { role: 'admin', roleUuid: undefined };
        projectState.current = [
            { projectUuid: 'training-1', type: ProjectType.TRAINING },
        ];
    });

    const openPicker = async () => {
        await userEvent.click(
            screen.getByRole('button', { name: 'Viewing as' }),
        );
        return screen.getByRole('menu');
    };

    it('offers the system roles alone when the org has no custom roles', async () => {
        renderPage();

        const menu = await openPicker();
        expect(within(menu).getByText('Roles')).toBeTruthy();
        expect(within(menu).queryByText('Custom roles')).toBeNull();
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent),
        ).toEqual([
            'Viewer',
            'Interactive viewer',
            'Editor',
            'Developer',
            // The admin this test renders as holds the last one.
            'AdminYour role',
        ]);
    });

    it("lists the org's custom roles under their own heading", async () => {
        rolesState.current = [
            { roleUuid: 'role-2', name: 'Steward', scopes: [] },
            analyst,
        ];

        renderPage();

        const menu = await openPicker();
        expect(within(menu).getByText('Custom roles')).toBeTruthy();
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent)
                .slice(5),
        ).toEqual(['Analyst', 'Steward']);
    });

    it('marks the role the learner holds, and only that one', async () => {
        rolesState.current = [analyst];
        userState.current = { role: 'member', roleUuid: 'role-1' };

        renderPage();

        const menu = await openPicker();
        const own = within(menu)
            .getAllByRole('menuitem')
            .filter((item) => item.textContent?.includes('Your role'));
        expect(own.map((item) => item.textContent)).toEqual([
            'AnalystYour role',
        ]);
    });

    it('marks a system role when that is what the learner holds', async () => {
        userState.current = { role: 'editor', roleUuid: undefined };

        renderPage();

        const menu = await openPicker();
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .filter((item) => item.textContent?.includes('Your role'))
                .map((item) => item.textContent),
        ).toEqual(['EditorYour role']);
    });

    it('marks nothing when the learner holds no role the library shows', async () => {
        userState.current = { role: 'member', roleUuid: undefined };

        renderPage();

        const menu = await openPicker();
        expect(within(menu).queryAllByText('Your role')).toEqual([]);
    });

    it('opens on the custom role the learner holds', () => {
        rolesState.current = [analyst];
        userState.current = { role: 'member', roleUuid: 'role-1' };

        const { container } = renderPage();

        expect(
            container
                .querySelector('[data-learn-role]')
                ?.getAttribute('data-learn-role'),
        ).toBe('role-1');
        expect(
            screen.getByRole('button', { name: 'Viewing as' }).textContent,
        ).toContain('Analyst');
    });

    it('opens on the matching system role when the learner holds no custom one', () => {
        userState.current = { role: 'editor', roleUuid: undefined };

        const { container } = renderPage();

        expect(
            container
                .querySelector('[data-learn-role]')
                ?.getAttribute('data-learn-role'),
        ).toBe('editor');
    });

    it('reads the library as the role that is picked', async () => {
        rolesState.current = [analyst];

        const { container } = renderPage();
        await userEvent.click(
            screen.getByRole('button', { name: 'Viewing as' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Analyst' }),
        );

        expect(
            container
                .querySelector('[data-learn-role]')
                ?.getAttribute('data-learn-role'),
        ).toBe('role-1');
        // A module the custom role holds carries no note; one it lacks names
        // the role rather than a rung of the system ladder.
        const validation = container.querySelector(
            '[data-learn-module="manage:Validation"]',
        );
        expect(validation?.textContent).not.toContain('Not in Analyst');
        const pinning = container.querySelector(
            '[data-learn-module="manage:PinnedItems"]',
        );
        expect(pinning?.textContent).toContain('Not in Analyst');
    });
});
