import { Ability } from '@casl/ability';
import { ProjectType, type HomepageLearnBlock } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLearnCatalogue } from '../../../../features/learn/catalogue';
import LearnPage from '../../../../features/learn/LearnPage';
import { LearnBlockBuild, LearnBlockView } from './LearnBlock';

const {
    start,
    reportEmpty,
    learnPermission,
    projectState,
    accessState,
    progressState,
    releasedState,
} = vi.hoisted(() => ({
    releasedState: { days: {} as Record<string, string> },
    start: vi.fn(),
    reportEmpty: vi.fn(),
    learnPermission: { granted: true },
    projectState: { current: [] as unknown[] },
    accessState: { current: [] as string[] },
    progressState: {
        current: {
            completed: [] as string[],
            started: [] as string[],
            lastStarted: null as string | null,
        },
    },
}));

vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: {
                organizationUuid: 'org-1',
                userUuid: 'user-1',
                firstName: 'Ada',
                ability: new Ability(
                    learnPermission.granted
                        ? [
                              {
                                  action: 'view',
                                  subject: 'Learn',
                                  conditions: { organizationUuid: 'org-1' },
                              },
                          ]
                        : [],
                ),
            },
        },
    }),
}));

vi.mock('../../../../hooks/useProjects', () => ({
    useProjects: () => ({ data: projectState.current }),
}));

// The real access and progress hooks ask the instance; how they are read
// (heldScopes, upNextFor) is the real thing.
vi.mock('../../../../features/learn/useLearnAccess', async () => {
    const { heldScopes } = await import('../../../../features/learn/access');
    return {
        useLearnAccess: () => ({
            held: heldScopes(accessState.current, true),
            isSettled: true,
        }),
    };
});

vi.mock('../../../../features/learn/progress', () => ({
    useLearnProgress: () => ({ ...progressState.current, isSettled: true }),
    useLearnProgressActions: () => ({
        markScopeStarted: vi.fn(),
        markScopeCompleted: vi.fn(),
    }),
}));

// Every gate open: the block reads the same catalogue the library does.
vi.mock('../../../../features/learn/availability', () => ({
    useLearnAvailability: () => ({
        isOpen: () => true,
        isSettled: true,
    }),
}));

vi.mock('../../../../features/learn/useStartWalkthrough', () => ({
    useStartWalkthrough: () => ({ start, opening: null }),
}));

// Release days are generated from git; fixed here for the Newest mode tests.
vi.mock('../../../../features/scopeTours/released', () => ({
    get TOUR_RELEASED() {
        return releasedState.days;
    },
}));

vi.mock('../hooks/useRuntimeEmptyBlocks', () => ({
    useReportRuntimeEmpty: reportEmpty,
}));

// Only for rendering the library beside the block.
vi.mock('../../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('../../../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
}));
vi.mock('../../../../features/learn/useStartFresh', () => ({
    useStartFresh: () => ({ mutate: vi.fn(), isLoading: false }),
}));
vi.mock('../../../../features/learn/useEnableLearn', () => ({
    useEnableLearn: () => ({ mutate: vi.fn(), isLoading: false, error: null }),
}));
vi.mock('../../../../features/learn/thumbnails', () => ({
    thumbnailFor: () => undefined,
}));

const TRAINING = {
    projectUuid: 'training',
    name: 'Training',
    type: ProjectType.TRAINING,
};
const HOME = { projectUuid: 'p1', name: 'Home', type: ProjectType.DEFAULT };

const block: HomepageLearnBlock = {
    id: 'learn-1',
    type: 'learn',
    config: { title: 'Keep learning' },
};

const walkthroughs = buildLearnCatalogue().filter((m) => m.available);

const wrap = (children: ReactNode) => (
    <MantineProvider env="test">
        <MemoryRouter>{children}</MemoryRouter>
    </MantineProvider>
);

const renderView = () =>
    render(
        wrap(<LearnBlockView block={block} projectUuid="p1" itemSpan={null} />),
    );

const recommendedScope = (container: HTMLElement) =>
    container
        .querySelector('[data-learn-recommended]')
        ?.getAttribute('data-learn-recommended');

// Mantine's provider leaves its style tags, so look for the block itself.
const expectNothingRendered = () => {
    expect(screen.queryByText('Keep learning')).toBeNull();
    expect(document.querySelector('[data-homepage-block]')).toBeNull();
};

beforeEach(() => {
    start.mockReset();
    reportEmpty.mockReset();
    learnPermission.granted = true;
    projectState.current = [HOME, TRAINING];
    accessState.current = [];
    progressState.current = { completed: [], started: [], lastStarted: null };
});

describe('LearnBlockView', () => {
    it('shows the next module with progress and starts it like the library', async () => {
        const { container } = renderView();
        const scope = recommendedScope(container);
        expect(scope).toBeTruthy();
        const module = walkthroughs.find((m) => m.scope === scope)!;
        expect(screen.getByText('Keep learning')).toBeInTheDocument();
        expect(screen.getByText(module.title)).toBeInTheDocument();
        expect(
            screen.getByText(`0 of ${walkthroughs.length} complete`),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Open Learn' }),
        ).toHaveAttribute('href', '/projects/p1/learn');

        await userEvent.click(screen.getByRole('button', { name: 'Start' }));
        expect(start).toHaveBeenCalledWith(scope, 'homepage');
        expect(reportEmpty).toHaveBeenLastCalledWith('learn-1', false, false);
    });

    it('says Resume when the next module has been started', () => {
        const first = renderView();
        const scope = recommendedScope(first.container)!;
        first.unmount();
        progressState.current = {
            completed: [],
            started: [scope],
            lastStarted: null,
        };
        renderView();
        expect(
            screen.getByRole('button', { name: 'Resume' }),
        ).toBeInTheDocument();
    });

    it('picks the same next module as the Learn page', () => {
        // A learner with some access and some finished modules, so the
        // recommendation is neither the first module nor trivially ordered.
        accessState.current = ['manage:SavedChart', 'create:Space'];
        progressState.current = {
            completed: walkthroughs.slice(0, 3).flatMap((m) => m.scopes),
            started: [walkthroughs[5].scope],
            lastStarted: walkthroughs[5].scope,
        };
        const library = render(wrap(<LearnPage />));
        const fromLibrary = recommendedScope(library.container);
        library.unmount();

        const { container } = renderView();
        expect(fromLibrary).toBeTruthy();
        expect(recommendedScope(container)).toBe(fromLibrary);
    });

    it('shows a finished state that links to Learn once everything is done', () => {
        progressState.current = {
            completed: walkthroughs.flatMap((m) => m.scopes),
            started: [],
            lastStarted: null,
        };
        const { container } = renderView();
        expect(
            screen.getByText('You have finished every module'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                `${walkthroughs.length} of ${walkthroughs.length} complete`,
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Open Learn' }),
        ).toHaveAttribute('href', '/projects/p1/learn');
        expect(recommendedScope(container)).toBeUndefined();
        expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    });

    it('renders nothing when the viewer cannot see Learn', () => {
        learnPermission.granted = false;
        renderView();
        expectNothingRendered();
        expect(reportEmpty).toHaveBeenLastCalledWith('learn-1', true, false);
    });

    it('renders nothing before the organization has enabled Learn', () => {
        projectState.current = [HOME];
        renderView();
        expectNothingRendered();
        expect(reportEmpty).toHaveBeenLastCalledWith('learn-1', true, false);
    });

    it('renders nothing inside a training copy', () => {
        projectState.current = [
            { projectUuid: 'p1', name: 'Copy', type: ProjectType.PREVIEW },
            TRAINING,
        ];
        renderView();
        expectNothingRendered();
    });
});

describe('Featured walkthroughs', () => {
    const pinnedBlock = (pinnedScopes: string[]): HomepageLearnBlock => ({
        ...block,
        config: { ...block.config, pinnedScopes },
    });

    it('lists pinned walkthroughs with the learner state, skipping unknown scopes', async () => {
        const [, second, third] = walkthroughs;
        progressState.current = {
            completed: second.scopes,
            started: [],
            lastStarted: null,
        };
        render(
            wrap(
                <LearnBlockView
                    block={pinnedBlock([
                        second.scope,
                        'view:NoSuchThing',
                        third.scope,
                    ])}
                    projectUuid="p1"
                    itemSpan={null}
                />,
            ),
        );
        const rows = Array.from(
            document.querySelectorAll(
                '[data-learn-pinned] [data-learn-module]',
            ),
        ).map((row) => row.getAttribute('data-learn-module'));
        // The recommendation is not repeated in the list.
        const recommended = recommendedScope(document.body);
        expect(rows).toEqual(
            [second.scope, third.scope].filter((s) => s !== recommended),
        );
        expect(
            screen.getByText('Picked by your data team'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Start again' }),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Start again' }),
        );
        expect(start).toHaveBeenCalledWith(second.scope, 'homepage');
    });

    it('shows no list when nothing is pinned', () => {
        renderView();
        expect(document.querySelector('[data-learn-pinned]')).toBeNull();
    });
});

describe('Newest modules', () => {
    const newestBlock: HomepageLearnBlock = {
        ...block,
        config: { ...block.config, show: 'newest' },
    };
    const plain = walkthroughs.filter((m) => m.kind !== 'docs');
    const [oldest, middle, newest, notHeld] = plain;

    beforeEach(() => {
        releasedState.days = {
            [oldest.scope]: '2026-08-01',
            [middle.scope]: '2026-10-01',
            [newest.scope]: '2026-10-07',
            [notHeld.scope]: '2026-10-20',
        };
    });

    const renderNewest = () =>
        render(
            wrap(
                <LearnBlockView
                    block={newestBlock}
                    projectUuid="p1"
                    itemSpan={null}
                />,
            ),
        );

    it('leads with the newest module the viewer can do, then the next newest', async () => {
        accessState.current = [oldest.scope, middle.scope, newest.scope];
        progressState.current = {
            completed: middle.scopes,
            started: [newest.scope],
            lastStarted: newest.scope,
        };
        renderNewest();
        const hero = document.querySelector('[data-learn-newest]')!;
        // The newest release overall is one the viewer does not hold.
        expect(hero).toHaveAttribute('data-learn-newest', newest.scope);
        expect(hero).toHaveTextContent('New');
        expect(hero).toHaveTextContent(newest.title);
        const alsoNew = Array.from(
            document.querySelectorAll(
                '[data-learn-also-new] [data-learn-module]',
            ),
        ).map((row) => row.getAttribute('data-learn-module'));
        expect(alsoNew).toEqual([middle.scope, oldest.scope]);
        expect(screen.getByText('Also new')).toBeInTheDocument();
        // Per-viewer state: started, complete, not started.
        expect(
            screen.getByRole('button', { name: 'Resume' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Start again' }),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
        expect(start).toHaveBeenCalledWith(newest.scope, 'homepage');
    });

    it('marks only modules released close to the latest release as new', () => {
        accessState.current = [oldest.scope, middle.scope, newest.scope];
        renderNewest();
        const row = (scope: string) =>
            document.querySelector(
                `[data-learn-also-new] [data-learn-module="${scope}"]`,
            )!;
        expect(row(middle.scope)).toHaveTextContent('New');
        expect(row(oldest.scope)).not.toHaveTextContent('New');
    });

    it('falls back to the next module when the viewer holds none of them', () => {
        accessState.current = [];
        const { container } = renderNewest();
        expect(container.querySelector('[data-learn-newest]')).toBeNull();
        expect(recommendedScope(container)).toBeTruthy();
        expect(document.querySelector('[data-learn-also-new]')).toBeNull();
    });

    it('does not show the editor-only label to viewers', () => {
        accessState.current = [newest.scope];
        renderNewest();
        expect(screen.queryByText('Personal per viewer')).toBeNull();
    });
});

describe('LearnBlockBuild', () => {
    it('lets the editor switch to the newest modules', async () => {
        const onChange = vi.fn();
        render(
            wrap(
                <LearnBlockBuild
                    block={block}
                    projectUuid="p1"
                    itemSpan={null}
                    onChange={onChange}
                />,
            ),
        );
        expect(screen.getByText('Personal per viewer')).toBeInTheDocument();
        await userEvent.click(screen.getByText('Newest modules'));
        expect(onChange).toHaveBeenCalledWith({
            ...block,
            config: { ...block.config, show: 'newest' },
        });
    });

    it('shows the builder a sample that cannot start a walkthrough', () => {
        render(
            wrap(
                <LearnBlockBuild
                    block={block}
                    projectUuid="p1"
                    itemSpan={null}
                    onChange={vi.fn()}
                />,
            ),
        );
        expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
        expect(screen.queryByRole('link', { name: 'Open Learn' })).toBeNull();
        expect(
            screen.getByText(/Showing your own progress as a sample/),
        ).toBeInTheDocument();
    });

    it('tells the builder when viewers will not see the block', () => {
        projectState.current = [HOME];
        render(
            wrap(
                <LearnBlockBuild
                    block={block}
                    projectUuid="p1"
                    itemSpan={null}
                    onChange={vi.fn()}
                />,
            ),
        );
        expect(
            screen.getByText(/Learn is not enabled for this organization yet/),
        ).toBeInTheDocument();
    });
});
