import {
    OrganizationMemberRole,
    type LearnAskMatch,
    type LearnBadgesResults,
} from '@lightdash/common';
import { emptyRollup, SUGGESTION_LIMIT } from '@lightdash/learn-ui';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { LearnUiRoot } from '../LearnUiRoot';
import { entry } from '../testFixtures';
import { LearnBoardPanel } from './LearnBoardPanel';

const navigate = vi.fn();
vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof ReactRouter>('react-router');
    return {
        ...actual,
        useNavigate: () => navigate,
        useParams: () => ({ projectUuid: 'project-1' }),
    };
});

const catalogue = [
    entry({
        id: 'foundation',
        title: 'Getting around',
        scope: 'view:Project',
        lessonCount: 2,
    }),
    // Untagged, so every role holds it.
    entry({
        id: 'sharing',
        title: 'Sharing your work',
        scope: null,
        lessonCount: 2,
    }),
    entry({
        id: 'dashboards',
        title: 'Building dashboards',
        scope: 'manage:Dashboard',
        lessonCount: 2,
    }),
];

// Swappable so a test can serve a differently shaped catalogue (CS-169).
const catalogueState: { courses: typeof catalogue } = { courses: catalogue };

const defaultRollups = () =>
    new Map([
        [
            'foundation',
            {
                ...emptyRollup(),
                started: true,
                lessonsCompleted: new Set(['l1']),
            },
        ],
    ]);
// Swappable so a test can hand the board different progress (CS-169).
const rollupsState = { map: defaultRollups() };

type AskCallbacks = {
    onSuccess?: (data: { matches: LearnAskMatch[] }) => void;
    onError?: () => void;
    onSettled?: () => void;
};
const askCalls: Array<{ query: string } & AskCallbacks> = [];
const askMutate = vi.fn(
    (variables: { query: string }, options: AskCallbacks = {}) => {
        askCalls.push({ query: variables.query, ...options });
    },
);
// Answers arrive through the mutation callbacks, so a test can settle two
// requests in whichever order it likes.
const answerWith = (matches: LearnAskMatch[], index = askCalls.length - 1) => {
    const call = askCalls[index];
    act(() => {
        call.onSuccess?.({ matches });
        call.onSettled?.();
    });
};
const askState: { isLoading: boolean; isError: boolean } = {
    isLoading: false,
    isError: false,
};
const bronzeEverywhere: LearnBadgesResults = {
    badges: [
        { courseId: 'foundation', tier: 'bronze' },
        { courseId: 'sharing', tier: 'bronze' },
    ],
};
const badgesState: {
    data: LearnBadgesResults | undefined;
    isInitialLoading: boolean;
} = {
    data: bronzeEverywhere,
    isInitialLoading: false,
};
// Hoisted: the mock factory reads this one eagerly, not from inside a closure.
const setLessonBookmarkMock = vi.hoisted(() => vi.fn());

// The pane's own useLearnCourse call (BoardRail/ModulePane now take the
// selected course as props rather than fetching it themselves). Undefined by
// default; a test that needs lesson-level content sets it before rendering.
const defaultSelectedCourse = () => ({
    data: undefined as
        | { id: string; lessons: { id: string; title: string; html: string }[] }
        | undefined,
    isInitialLoading: false,
    isError: false,
});
const selectedCourseState = { value: defaultSelectedCourse() };

vi.mock('../hooks', () => ({
    useLearnCatalogue: () => ({
        data: {
            generatedAt: '2026-08-01T00:00:00.000Z',
            courses: catalogueState.courses,
            suggestions: [
                { query: 'Where do I find a chart?', courseId: 'foundation' },
                { query: 'How do I build one?', courseId: 'dashboards' },
                { query: 'How do I share it?', courseId: 'sharing' },
                { query: 'Where does progress live?', courseId: 'foundation' },
                { query: 'What is a space?', courseId: 'sharing' },
            ],
        },
        isLoading: false,
        isError: false,
    }),
    useLearnRollups: () => ({
        rollups: rollupsState.map,
        isLoading: false,
        serverSynced: false,
    }),
    useLearnCourse: () => selectedCourseState.value,
    useLearnBadges: () => badgesState,
    useLearnAsk: () => ({
        mutate: askMutate,
        reset: () => {
            askState.isError = false;
        },
        isLoading: askState.isLoading,
        isError: askState.isError,
    }),
    setLessonBookmark: setLessonBookmarkMock,
}));

describe('LearnBoardPanel', () => {
    beforeEach(() => {
        navigate.mockClear();
        askMutate.mockClear();
        askCalls.length = 0;
        setLessonBookmarkMock.mockClear();
        askState.isLoading = false;
        askState.isError = false;
        badgesState.data = bronzeEverywhere;
        badgesState.isInitialLoading = false;
        catalogueState.courses = catalogue;
        rollupsState.map = defaultRollups();
        selectedCourseState.value = defaultSelectedCourse();
    });

    it('re-opens a completed module when a role change unlocks a lesson', async () => {
        // Completed (quiz passed) with the 2 lessons visible to interactive
        // viewer; the editor role holds all 3 — the module must leave the
        // completed state and queue up as 2 of 3, not stay complete.
        catalogueState.courses = [
            entry({
                id: 'comments',
                title: 'Commenting on dashboards',
                scope: 'view:DashboardComments',
                lessonCount: 3,
                lessonScopes: [
                    'view:DashboardComments',
                    'create:DashboardComments',
                    'manage:DashboardComments',
                ],
            }),
        ];
        rollupsState.map = new Map([
            [
                'comments',
                {
                    ...emptyRollup(),
                    started: true,
                    passed: true,
                    completed: true,
                    lessonsCompleted: new Set(['l1', 'l2']),
                },
            ],
        ]);
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.EDITOR },
            },
        );
        await waitFor(() =>
            expect(screen.getByRole('tab', { name: 'editor' })).toHaveAttribute(
                'aria-selected',
                'true',
            ),
        );
        expect(screen.getByText(/1 module, 0 finished/)).toBeInTheDocument();
        // The overall rail line and the queue card both count 2 of 3.
        expect(screen.getAllByText(/2 of 3 lessons/).length).toBeGreaterThan(0);
        // On the interactive viewer tab everything visible is done, so the
        // module stays complete.
        fireEvent.click(
            screen.getByRole('tab', { name: 'interactive viewer' }),
        );
        expect(screen.getByText(/1 module, 1 finished/)).toBeInTheDocument();
    });

    it('counts only role-visible lessons for held modules and keeps full counts on locked ones', async () => {
        // CS-169 scope-group module: a viewer holds view:DashboardComments
        // but not create/manage, so 1 of 3 lessons is visible. The locked
        // manage:Dashboard module keeps its full count — a locked node
        // describes the whole module.
        catalogueState.courses = [
            entry({
                id: 'comments',
                title: 'Commenting on dashboards',
                scope: 'view:DashboardComments',
                lessonCount: 3,
                lessonScopes: [
                    'view:DashboardComments',
                    'create:DashboardComments',
                    'manage:DashboardComments',
                ],
            }),
            entry({
                id: 'dashboards',
                title: 'Building dashboards',
                scope: 'manage:Dashboard',
                lessonCount: 3,
                lessonScopes: ['manage:Dashboard', 'manage:Dashboard', null],
            }),
        ];
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        await waitFor(() =>
            expect(screen.getByRole('tab', { name: 'viewer' })).toHaveAttribute(
                'aria-selected',
                'true',
            ),
        );
        const board = screen.getByTestId('learn-board');
        expect(
            board.querySelector(
                '[aria-label="Commenting on dashboards, 1 lesson"]',
            ),
        ).not.toBeNull();
        // Locked node: full lesson count, not the viewer-visible one.
        expect(
            board.querySelector(
                '[aria-label="Building dashboards, 3 lessons"]',
            ),
        ).not.toBeNull();
        // The rail totals sum visible lessons of held modules only.
        expect(screen.getByText(/0 of 1 lesson ·/)).toBeInTheDocument();
    });

    it('defaults to the org role and lights only the held modules', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        await waitFor(() =>
            expect(screen.getByRole('tab', { name: 'viewer' })).toHaveAttribute(
                'aria-selected',
                'true',
            ),
        );
        expect(
            screen.getByText(/Everything your viewer role unlocks/),
        ).toBeInTheDocument();
        // Locked nodes leave the accessibility tree, so query the DOM directly.
        const locked = screen
            .getByTestId('learn-board')
            .querySelector('[aria-label^="Building dashboards"]');
        expect(locked).toHaveAttribute('tabindex', '-1');
        expect(locked).toHaveAttribute('aria-hidden', 'true');
        expect(locked).toBeDisabled();
    });

    it('reads the org role once the user query resolves, even when it differs from the pre-resolution fallback', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.ADMIN },
            },
        );
        // Renders on the VIEWER fallback first, since `user` is still
        // resolving; only settles on the admin tab once that query lands.
        await waitFor(() =>
            expect(screen.getByRole('tab', { name: 'admin' })).toHaveAttribute(
                'aria-selected',
                'true',
            ),
        );
        expect(
            screen.getByText(/Everything your admin role unlocks/),
        ).toBeInTheDocument();
    });

    it('switching role unlocks more modules and selecting one opens the pane', async () => {
        selectedCourseState.value = {
            data: {
                id: 'dashboards',
                lessons: [
                    { id: 'l1', title: 'Anatomy of a dashboard', html: '' },
                    { id: 'l2', title: 'Filter a dashboard', html: '' },
                ],
            },
            isInitialLoading: false,
            isError: false,
        };
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        expect(await screen.findAllByRole('tab')).toHaveLength(5);
        fireEvent.click(await screen.findByRole('tab', { name: 'editor' }));
        const node = within(screen.getByTestId('learn-board')).getByRole(
            'button',
            { name: /Building dashboards/ },
        );
        await waitFor(() => expect(node).toHaveAttribute('tabindex', '0'));
        fireEvent.click(node);
        expect(screen.getByText('manage:Dashboard')).toBeInTheDocument();
        expect(screen.getByText(/Anatomy of a dashboard/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Start module' }));
        expect(navigate).toHaveBeenCalledWith(
            '/projects/project-1/learn/courses/dashboards',
        );
    });

    it('hands focus back to the node when the pane closes', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        const node = within(await screen.findByTestId('learn-board')).getByRole(
            'button',
            { name: /Getting around/ },
        );
        fireEvent.click(node);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        await waitFor(() => expect(node).toHaveFocus());
    });

    it('switching role clears the open module pane', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        fireEvent.click(await screen.findByRole('tab', { name: 'editor' }));
        const node = within(screen.getByTestId('learn-board')).getByRole(
            'button',
            { name: /Building dashboards/ },
        );
        await waitFor(() => expect(node).toHaveAttribute('tabindex', '0'));
        fireEvent.click(node);
        expect(
            screen.getByRole('button', { name: 'Close' }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'admin' }));
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Close' }),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getByText('Pick up where you left off'),
        ).toBeInTheDocument();
    });

    it('shows only the chips the selected role holds, capped at one row', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        expect(
            await screen.findByRole('button', {
                name: 'Where do I find a chart?',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'How do I build one?' }),
        ).not.toBeInTheDocument();
        // 'What is a space?' is held too, but it is the fourth offer.
        const chips = within(screen.getByTestId('ask-chips')).getAllByRole(
            'button',
        );
        expect(chips).toHaveLength(SUGGESTION_LIMIT);
        expect(chips.map((chip) => chip.textContent)).toEqual([
            'Where do I find a chart?',
            'How do I share it?',
            'Where does progress live?',
        ]);
    });

    it('puts the Ask bar above the role tabs', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        const search = await screen.findByRole('search');
        const tabs = screen.getByRole('tablist');
        expect(
            search.compareDocumentPosition(tabs) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it('treats an answer naming modules the catalogue lost as no answer', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        fireEvent.change(await screen.findByRole('searchbox'), {
            target: { value: 'anything' },
        });
        fireEvent.submit(screen.getByRole('search'));
        answerWith([
            {
                courseId: 'retired',
                lessonId: 'l1',
                title: 'Gone from the library',
                score: 0.9,
            },
        ]);
        expect(
            await screen.findByText('Nothing in the library matches that yet'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Gone from the library'),
        ).not.toBeInTheDocument();
        const untouched = screen
            .getByTestId('learn-board')
            .querySelector<HTMLElement>('[aria-label^="Sharing your work"]');
        expect(untouched?.style.opacity).not.toBe('0.4');
    });

    it('keeps the answer across a role change and re-derives the locked matches', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        fireEvent.change(await screen.findByRole('searchbox'), {
            target: { value: 'filters' },
        });
        fireEvent.submit(screen.getByRole('search'));
        answerWith([
            {
                courseId: 'dashboards',
                lessonId: 'l1',
                title: 'Filter a dashboard',
                score: 0.9,
            },
        ]);
        expect(
            await screen.findByTestId('ask-locked-note'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Open' }),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'editor' }));
        await waitFor(() =>
            expect(
                screen.queryByTestId('ask-locked-note'),
            ).not.toBeInTheDocument(),
        );
        expect(screen.getByText('Filter a dashboard')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Open' }),
        ).toBeInTheDocument();
    });

    it('submitting a question searches and lights the matched module, and clearing restores the board', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        fireEvent.change(await screen.findByRole('searchbox'), {
            target: { value: 'where are my charts' },
        });
        fireEvent.submit(screen.getByRole('search'));
        expect(askMutate).toHaveBeenCalledWith(
            { query: 'where are my charts' },
            expect.anything(),
        );

        answerWith([
            {
                courseId: 'foundation',
                lessonId: 'l2',
                title: 'Finding saved charts',
                score: 0.8,
            },
        ]);
        expect(
            await screen.findByText('Finding saved charts'),
        ).toBeInTheDocument();
        const dimmed = screen
            .getByTestId('learn-board')
            .querySelector<HTMLElement>('[aria-label^="Sharing your work"]');
        expect(dimmed?.style.opacity).toBe('0.4');

        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        await waitFor(() => expect(dimmed?.style.opacity).toBe('1'));
        expect(
            screen.queryByText('Finding saved charts'),
        ).not.toBeInTheDocument();
    });

    it('sends one request for a double submit and keeps the answer on a resubmit', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        fireEvent.change(await screen.findByRole('searchbox'), {
            target: { value: 'where are my charts' },
        });
        fireEvent.submit(screen.getByRole('search'));
        fireEvent.submit(screen.getByRole('search'));
        expect(askMutate).toHaveBeenCalledTimes(1);

        answerWith([
            {
                courseId: 'foundation',
                lessonId: 'l2',
                title: 'Finding saved charts',
                score: 0.8,
            },
        ]);
        expect(
            await screen.findByText('Finding saved charts'),
        ).toBeInTheDocument();
        fireEvent.submit(screen.getByRole('search'));
        expect(askMutate).toHaveBeenCalledTimes(1);
    });

    it('holds the answer while the next question runs and ignores the stale response', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        fireEvent.change(await screen.findByRole('searchbox'), {
            target: { value: 'where are my charts' },
        });
        fireEvent.submit(screen.getByRole('search'));
        answerWith([
            {
                courseId: 'foundation',
                lessonId: 'l2',
                title: 'Finding saved charts',
                score: 0.8,
            },
        ]);
        expect(
            await screen.findByText('Finding saved charts'),
        ).toBeInTheDocument();

        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'how do I share' },
        });
        fireEvent.submit(screen.getByRole('search'));
        // The board must not flash back to undimmed while the answer reloads.
        expect(screen.getByText('Finding saved charts')).toBeInTheDocument();
        const dimmed = screen
            .getByTestId('learn-board')
            .querySelector<HTMLElement>('[aria-label^="Sharing your work"]');
        expect(dimmed?.style.opacity).toBe('0.4');

        answerWith([
            {
                courseId: 'sharing',
                lessonId: 'l1',
                title: 'Sharing basics',
                score: 0.9,
            },
        ]);
        expect(await screen.findByText('Sharing basics')).toBeInTheDocument();

        // The first request answers late: the newer answer stands.
        answerWith(
            [
                {
                    courseId: 'foundation',
                    lessonId: 'l2',
                    title: 'Finding saved charts',
                    score: 0.8,
                },
            ],
            0,
        );
        expect(screen.getByText('Sharing basics')).toBeInTheDocument();
        expect(
            screen.queryByText('Finding saved charts'),
        ).not.toBeInTheDocument();
    });

    it('opening a match bookmarks the lesson then navigates to the course', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        fireEvent.change(await screen.findByRole('searchbox'), {
            target: { value: 'charts' },
        });
        fireEvent.submit(screen.getByRole('search'));
        answerWith([
            {
                courseId: 'foundation',
                lessonId: 'l2',
                title: 'Finding saved charts',
                score: 0.8,
            },
        ]);
        fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
        expect(setLessonBookmarkMock).toHaveBeenCalledWith('foundation', 'l2');
        expect(navigate).toHaveBeenCalledWith(
            '/projects/project-1/learn/courses/foundation',
        );
    });

    it('renders the role badge card from the badge tiers', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        expect(await screen.findByText('viewer badge')).toBeInTheDocument();
        // The rung word also appears in the disclosure, so pin the hero span.
        expect(
            screen.getByText('Bronze', { selector: 'span' }),
        ).toBeInTheDocument();
    });

    it('switches the badge when the role tab changes', async () => {
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        expect(await screen.findByText('viewer badge')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'editor' }));
        expect(await screen.findByText('editor badge')).toBeInTheDocument();
        // Editor also holds the untiered dashboards module, so the role drops
        // back to the lowest rung.
        expect(
            screen.getByText('Locked', { selector: 'span' }),
        ).toBeInTheDocument();
    });

    it('waits for the badges query rather than calling it unavailable', async () => {
        badgesState.data = undefined;
        badgesState.isInitialLoading = true;
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        expect(await screen.findByText('Loading badges')).toBeInTheDocument();
        expect(
            screen.queryByText('Badges unavailable right now'),
        ).not.toBeInTheDocument();
    });

    it('says badges are unavailable rather than showing them as locked', async () => {
        badgesState.data = { badges: null };
        renderWithProviders(
            <LearnUiRoot>
                <LearnBoardPanel />
            </LearnUiRoot>,
            {
                user: { role: OrganizationMemberRole.VIEWER },
            },
        );
        expect(await screen.findByText('Overall')).toBeInTheDocument();
        expect(screen.getByText('viewer badge')).toBeInTheDocument();
        expect(
            screen.getByText('Badges unavailable right now'),
        ).toBeInTheDocument();
    });
});
