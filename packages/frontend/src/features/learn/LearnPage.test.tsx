import { Ability } from '@casl/ability';
import { ProjectType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventName } from '../../types/Events';
import { buildLearnCatalogue } from './catalogue';
import LearnPage from './LearnPage';
import { SANDBOX_LESSONS } from './sandboxLessons';

const {
    track,
    projectState,
    learnFlagState,
    availabilityState,
    accessState,
    progressState,
    learnActions,
} = vi.hoisted(() => ({
    track: vi.fn(),
    projectState: { current: [] as unknown[] },
    learnFlagState: { current: { enabled: true }, isLoading: false },
    availabilityState: {
        current: { isSettled: true, closed: [] as string[] },
    },
    // Everything the learner can do, anywhere.
    accessState: { current: [] as string[] },
    // What the instance holds for the learner.
    progressState: {
        current: {
            completed: [] as string[],
            started: [] as string[],
            lastStarted: null as string | null,
        },
    },
    learnActions: {
        markScopeStarted: vi.fn(),
        markScopeCompleted: vi.fn(),
    },
}));

vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: {
                organizationUuid: 'org-1',
                role: 'admin',
                ability: new Ability([
                    { action: 'manage', subject: 'Organization' },
                ]),
            },
        },
    }),
}));

// The learner's access comes from the instance; how the library reads a
// scope set is the real thing.
vi.mock('./useLearnAccess', async () => {
    const { heldScopes } = await import('./access');
    return {
        useLearnAccess: () => ({
            held: heldScopes(accessState.current, true),
            isSettled: true,
        }),
    };
});

// Progress comes from the instance; the tests set what it answers.
vi.mock('./progress', () => ({
    useLearnProgress: () => ({ ...progressState.current, isSettled: true }),
    useLearnProgressActions: () => learnActions,
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: learnFlagState.current,
        isLoading: learnFlagState.isLoading,
    }),
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
        isOpen: (module: { gate: string | null }) =>
            module.gate === null ||
            !availabilityState.current.closed.includes(module.gate),
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

const CurrentLocation = () => (
    <output data-testid="location">{useLocation().search}</output>
);

const renderPage = (query = '') =>
    render(
        <MemoryRouter initialEntries={[`/learn${query}`]}>
            <MantineProvider env="test">
                <LearnPage />
                <CurrentLocation />
            </MantineProvider>
        </MemoryRouter>,
    );

const viewEvents = () =>
    track.mock.calls
        .map(([event]) => event)
        .filter((event) => event.name === EventName.LEARN_LIBRARY_VIEWED);

describe('LearnPage analytics', () => {
    beforeEach(() => {
        progressState.current = {
            completed: [],
            started: [],
            lastStarted: null,
        };
        track.mockClear();
        learnFlagState.current = { enabled: true };
        learnFlagState.isLoading = false;
        availabilityState.current = { isSettled: true, closed: [] };
        accessState.current = scopes;
        projectState.current = [
            { projectUuid: 'training-1', type: ProjectType.TRAINING },
        ];
    });

    it('finds date zoom from a natural-language query and restores the library on clear', async () => {
        const { container } = renderPage();
        const cards = () =>
            Array.from(container.querySelectorAll('[data-learn-module]')).map(
                (card) => card.getAttribute('data-learn-module'),
            );
        const initial = cards();
        const input = screen.getByRole('textbox', {
            name: 'Search the library',
        });
        await userEvent.type(input, 'change from day to month');
        expect(cards()[0]).toBe('view:Dashboard');
        expect(cards()).not.toContain('manage:Space');
        await userEvent.clear(input);
        expect(cards()).toEqual(initial);
    });

    it('records one view per mount, with the progress the learner is looking at', () => {
        progressState.current = {
            started: [catalogue[0].scope, catalogue[1].scope],
            completed: [catalogue[0].scope],
            lastStarted: catalogue[1].scope,
        };

        const { rerender } = renderPage();
        rerender(
            <MemoryRouter>
                <MantineProvider env="test">
                    <LearnPage />
                    <CurrentLocation />
                </MantineProvider>
            </MemoryRouter>,
        );

        expect(viewEvents()).toEqual([
            {
                name: EventName.LEARN_LIBRARY_VIEWED,
                properties: {
                    organizationUuid: 'org-1',
                    trainingProjectUuid: 'training-1',
                    hasTrainingProject: true,
                    moduleCount: catalogue.filter((module) => module.available)
                        .length,
                    startedCount: 2,
                    completedCount: 1,
                },
            },
        ]);
    });

    it('counts only the scopes this instance has modules for', () => {
        progressState.current = {
            started: [catalogue[0].scope, 'manage:SomethingRetired'],
            completed: [catalogue[0].scope, 'manage:SomethingRetired'],
            lastStarted: null,
        };

        renderPage();

        expect(viewEvents()[0].properties).toMatchObject({
            completedCount: 1,
        });
    });

    it('matches the progress fraction and ignores unsupported-module progress', () => {
        const supported = catalogue.find((module) => module.available)!;
        const unsupported = catalogue.find((module) => !module.available)!;
        progressState.current = {
            started: [supported.scope, unsupported.scope],
            completed: [supported.scope, unsupported.scope],
            lastStarted: null,
        };
        const { container } = renderPage();
        const { moduleCount, startedCount, completedCount } =
            viewEvents()[0].properties;
        expect(moduleCount).toBe(42);
        expect(startedCount).toBe(1);
        expect(completedCount).toBe(1);
        expect(
            container
                .querySelector('[data-learn-progress]')
                ?.getAttribute('data-learn-progress'),
        ).toBe(`${completedCount}/${moduleCount}`);
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
        availabilityState.current = { isSettled: false, closed: [] };
        const { rerender } = renderPage();
        expect(viewEvents()).toEqual([]);

        availabilityState.current = { isSettled: true, closed: [] };
        rerender(
            <MemoryRouter>
                <MantineProvider env="test">
                    <LearnPage />
                    <CurrentLocation />
                </MantineProvider>
            </MemoryRouter>,
        );

        expect(viewEvents()).toHaveLength(1);
    });

    it('records nothing when Learn is switched off for the instance', () => {
        learnFlagState.current = { enabled: false };

        renderPage();

        expect(viewEvents()).toEqual([]);
    });
});

describe('LearnPage access', () => {
    const catalogueScopes = catalogue.map((module) => module.scope);
    /** Docs lessons need no scope, so every learner is shown them. */
    const lessons = SANDBOX_LESSONS.map((lesson) => lesson.id);
    const sorted = (scopes: (string | null)[]) =>
        [...scopes].sort((a, b) => (a ?? '').localeCompare(b ?? ''));

    beforeEach(() => {
        progressState.current = {
            completed: [],
            started: [],
            lastStarted: null,
        };
        track.mockClear();
        learnFlagState.current = { enabled: true };
        availabilityState.current = { isSettled: true, closed: [] };
        accessState.current = ['view:Dashboard', 'manage:Validation'];
        projectState.current = [
            { projectUuid: 'training-1', type: ProjectType.TRAINING },
        ];
    });

    const shown = (container: HTMLElement) =>
        [...container.querySelectorAll('[data-learn-module]')].map((card) =>
            card.getAttribute('data-learn-module'),
        );
    const toggleExtra = async () => {
        await userEvent.click(screen.getByLabelText('Filter'));
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Show extra modules' }),
        );
    };

    it('shows what the learner can do, and nothing else', () => {
        const { container } = renderPage();

        expect(sorted(shown(container))).toEqual(
            sorted(['manage:Validation', 'view:Dashboard', ...lessons]),
        );
    });

    it('reads their access however they came by it', () => {
        // A viewer at organization level who edits in one project holds the
        // editor features, wherever the grant came from.
        accessState.current = ['view:Dashboard', 'manage:Dashboard@space'];

        const { container } = renderPage();

        expect(shown(container)).toContain('manage:Dashboard');
    });

    it('keeps the rest behind the extra modules toggle', async () => {
        const { container } = renderPage();

        await toggleExtra();

        expect(shown(container).length).toBe(catalogueScopes.length);
        expect(
            container.querySelector('[data-learn-module="manage:PinnedItems"]')
                ?.textContent,
        ).toContain('Editor and above');
        expect(
            container.querySelector('[data-learn-module="view:Dashboard"]')
                ?.textContent,
        ).not.toContain('and above');
    });

    it('says what the shelf is showing', async () => {
        renderPage();
        expect(screen.getByText('What you can do')).toBeTruthy();

        await toggleExtra();
        expect(screen.getByText('Every module')).toBeTruthy();
    });

    it('lists the Metrics lesson under Developer for a learner who holds no scope', () => {
        accessState.current = [];

        const { container } = renderPage();

        const card = container.querySelector(
            '[data-learn-module="docs:semantic-layer/metrics"]',
        );
        expect(card).not.toBeNull();
        expect(card!.textContent).toContain('Metrics');
        expect(card!.textContent).toContain('11 steps');
        expect(
            container.querySelector('[data-learn-group="developer"]'),
        ).not.toBeNull();
    });

    it('hides the Developer section while the sandbox gate is closed', () => {
        availabilityState.current.closed = ['sandbox'];

        const { container } = renderPage();

        expect(
            container.querySelector(
                '[data-learn-module="docs:semantic-layer/metrics"]',
            ),
        ).toBeNull();
        expect(
            container.querySelector('[data-learn-group="developer"]'),
        ).toBeNull();
    });

    it('keeps the access filter when searching and clearing', async () => {
        const { container } = renderPage();
        const input = screen.getByRole('textbox', {
            name: 'Search the library',
        });
        await userEvent.type(input, 'dashboard');
        expect(shown(container)).toEqual(['view:Dashboard']);
        await userEvent.clear(input);
        expect(sorted(shown(container))).toEqual(
            sorted(['manage:Validation', 'view:Dashboard', ...lessons]),
        );
    });
});

describe('LearnPage unsupported modules', () => {
    beforeEach(() => {
        progressState.current = {
            completed: [],
            started: [],
            lastStarted: null,
        };
        track.mockClear();
        learnFlagState.current = { enabled: true };
        learnFlagState.isLoading = false;
        availabilityState.current = { isSettled: true, closed: [] };
        accessState.current = scopes;
        projectState.current = [
            { projectUuid: 'training-1', type: ProjectType.TRAINING },
        ];
    });

    it('ignores old reading links and leaves progress unchanged', () => {
        progressState.current = {
            completed: ['concept:view:Analytics'],
            started: ['concept:view:Analytics'],
            lastStarted: null,
        };
        const { container } = renderPage('?lesson=view%3AAnalytics');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(
            screen.queryByRole('button', {
                name: /Read lesson|Read again|I have read/i,
            }),
        ).toBeNull();
        const card = container.querySelector(
            '[data-learn-module="view:Analytics"]',
        )!;
        expect(card.textContent).toContain('Coming Soon');
        expect(card.querySelector('button')).toBeDisabled();
        expect(card.textContent).not.toContain('Complete');
        expect(learnActions.markScopeStarted).not.toHaveBeenCalled();
        expect(learnActions.markScopeCompleted).not.toHaveBeenCalled();
    });
});
