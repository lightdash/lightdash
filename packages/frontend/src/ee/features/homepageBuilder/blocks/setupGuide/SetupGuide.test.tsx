import {
    ApiConnectorType,
    type AgentOnboardingRun,
    type ExternalConnectionListItem,
    type OrganizationBrand,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { EventName } from '../../../../../types/Events';
import {
    type ActionStatus,
    type RecommendedActionsState,
} from '../useRecommendedActions';
import { SetupGuideView } from './SetupGuide';
import {
    buildSetupGuide,
    countProgress,
    type SetupGuideFacts,
    type SetupGuideRow,
} from './setupGuideModel';
import { type SetupGuideState } from './useSetupGuide';
import { YourData } from './YourData';

const track = vi.hoisted(() => vi.fn());

vi.mock('../../../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

vi.mock('../../hooks/useHomepageAbilities', () => ({
    useCanManageProject: () => true,
}));

vi.mock('../../../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { userUuid: 'u1' } } }),
}));

beforeEach(() => {
    track.mockClear();
    localStorage.clear();
});

const status = (overrides: Partial<ActionStatus> = {}): ActionStatus => ({
    isVisible: true,
    isComplete: false,
    annotation: null,
    doneIcon: null,
    url: '/setup',
    ctaLabel: 'Set up',
    ...overrides,
});

const run: AgentOnboardingRun = {
    agentOnboardingRunUuid: 'run-1',
    projectUuid: 'p1',
    status: 'running',
    stage: null,
    events: [],
    handoff: null,
    usage: null,
    files: [],
    errorMessage: null,
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
    startedAt: '2026-11-02T00:00:00.000Z',
    completedAt: null,
};

const brand: OrganizationBrand = {
    organizationUuid: 'org-1',
    domain: 'acme.com',
    name: 'Acme',
    description: null,
    logos: [],
    colors: [
        { hex: '#ff0000', type: 'brand', brightness: null },
        { hex: '#00ff00', type: 'accent', brightness: null },
    ],
    fonts: [],
    updatedAt: new Date('2026-11-02'),
};

const fresh: SetupGuideFacts = {
    projectUuid: 'p1',
    statuses: {
        'connect-warehouse': status(),
        'add-semantic-layer': status(),
        'connect-source-control': status({ isVisible: false }),
        'connect-slack': status(),
    },
    visibleActions: [
        'connect-warehouse',
        'add-semantic-layer',
        'connect-slack',
    ],
    skippedActions: [],
    skippedRows: [],
    semanticModelCount: 0,
    chartCount: 0,
    activeRun: null,
    completedRun: null,
    appSourceNames: [],
    canAddLiveSources: true,
    brand: null,
    teammateCount: 0,
};

const warehouseConnected: SetupGuideFacts['statuses'] = {
    ...fresh.statuses,
    'connect-warehouse': status({ isComplete: true, annotation: 'PostgreSQL' }),
};

const building: SetupGuideFacts = {
    ...fresh,
    statuses: warehouseConnected,
    activeRun: run,
};

const allDone: SetupGuideFacts = {
    ...fresh,
    statuses: {
        ...warehouseConnected,
        'connect-slack': status({ isComplete: true, annotation: 'Acme HQ' }),
    },
    semanticModelCount: 48,
    chartCount: 2,
    appSourceNames: ['PostHog'],
    brand,
    teammateCount: 3,
};

const someSkipped: SetupGuideFacts = {
    ...fresh,
    statuses: warehouseConnected,
    skippedActions: ['add-semantic-layer', 'connect-slack'],
};

const rowsOf = (facts: SetupGuideFacts): SetupGuideRow[] =>
    buildSetupGuide(facts).flatMap(({ rows }) => rows);

const rowById = (facts: SetupGuideFacts, id: SetupGuideRow['id']) =>
    rowsOf(facts).find((row) => row.id === id);

type GuideHandlers = {
    onAsk?: () => void;
    onSkip?: (row: SetupGuideRow) => void;
    onRestore?: (row: SetupGuideRow) => void;
    onMinimizedChange?: (isMinimized: boolean) => void;
    isMinimized?: boolean;
};

const guideTree = (facts: SetupGuideFacts, handlers: GuideHandlers = {}) => (
    <MantineProvider env="test">
        <MemoryRouter>
            <SetupGuideView
                projectUuid="p1"
                sections={buildSetupGuide(facts)}
                isMinimized={handlers.isMinimized ?? false}
                onMinimizedChange={handlers.onMinimizedChange ?? vi.fn()}
                onAsk={handlers.onAsk ?? vi.fn()}
                onSkip={handlers.onSkip ?? vi.fn()}
                onRestore={handlers.onRestore ?? vi.fn()}
            />
        </MemoryRouter>
    </MantineProvider>
);

const renderGuide = (facts: SetupGuideFacts, handlers: GuideHandlers = {}) =>
    render(guideTree(facts, handlers));

describe('buildSetupGuide', () => {
    it('groups rows into outcome sections, hiding integrations the instance lacks', () => {
        const sections = buildSetupGuide(fresh);
        expect(sections.map(({ title }) => title)).toEqual([
            'Your data',
            'Your semantic layer',
            'Your first chart',
            'Your brand',
            'Your team',
            'More data',
        ]);
        expect(rowById(fresh, 'source-control')).toBeUndefined();
        expect(rowById(fresh, 'slack')).toBeDefined();
    });

    it('drops the more data section when live sources are unavailable', () => {
        expect(
            buildSetupGuide({ ...fresh, canAddLiveSources: false }).map(
                ({ id }) => id,
            ),
        ).not.toContain('more-data');
    });

    it('starts every row as suggested', () => {
        expect(new Set(rowsOf(fresh).map((row) => row.status))).toEqual(
            new Set(['suggested']),
        );
        expect(countProgress(rowsOf(fresh))).toEqual({
            completed: 0,
            total: 7,
        });
    });

    it('shows background work as building with a run preview', () => {
        expect(rowById(building, 'warehouse')).toMatchObject({
            status: 'done',
            evidence: { text: 'PostgreSQL connected' },
        });
        expect(rowById(building, 'semantic-layer')).toMatchObject({
            status: 'building',
            preview: { kind: 'agent-run', run },
        });
    });

    it('bases the semantic layer on explores, not the dbt connection', () => {
        const dbtOnly: SetupGuideFacts = {
            ...fresh,
            statuses: {
                ...fresh.statuses,
                'add-semantic-layer': status({ isComplete: true }),
            },
        };
        expect(rowById(dbtOnly, 'semantic-layer')?.status).toBe('suggested');
        expect(
            rowById({ ...fresh, semanticModelCount: 48 }, 'semantic-layer'),
        ).toMatchObject({
            status: 'done',
            evidence: { text: '48 models ready to explore' },
        });
    });

    it('credits a finished build and links back to its run', () => {
        expect(
            rowById(
                {
                    ...fresh,
                    semanticModelCount: 3,
                    completedRun: { ...run, status: 'completed' },
                },
                'semantic-layer',
            ),
        ).toMatchObject({
            status: 'done',
            evidence: { text: '3 models built by Lightdash' },
            action: {
                label: 'Review',
                to: '/projects/p1/onboarding/runs/run-1',
            },
        });
    });

    it('completes every row once everything exists', () => {
        expect(countProgress(rowsOf(allDone))).toEqual({
            completed: 7,
            total: 7,
        });
        expect(rowById(allDone, 'brand')?.evidence?.swatches).toEqual([
            '#ff0000',
            '#00ff00',
        ]);
    });

    it('takes skipped rows out of the total', () => {
        expect(rowById(someSkipped, 'semantic-layer')?.status).toBe('skipped');
        expect(rowById(someSkipped, 'slack')?.status).toBe('skipped');
        expect(countProgress(rowsOf(someSkipped))).toEqual({
            completed: 1,
            total: 5,
        });
    });
});

describe('SetupGuideView', () => {
    it('lists every step with progress and links the open ones', () => {
        renderGuide(fresh);
        expect(
            screen.getByRole('region', { name: 'Getting started' }),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText('Skip Invite your team'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Define metrics and dimensions/ }),
        ).toHaveAttribute('href', '/setup');
    });

    it('marks background work as in progress', () => {
        renderGuide(building);
        expect(screen.getByLabelText('In progress')).toBeInTheDocument();
    });

    it('counts finished steps', () => {
        renderGuide({ ...allDone, teammateCount: 0 });
        expect(
            screen.getByRole('button', {
                name: 'Minimize getting started',
            }),
        ).toBeInTheDocument();
    });

    it('hides once nothing is pending, counting skipped as settled', () => {
        renderGuide(allDone);
        expect(screen.queryByText('Getting started')).toBeNull();

        renderGuide(
            {
                ...allDone,
                statuses: { ...allDone.statuses, 'connect-slack': status() },
                skippedActions: ['connect-slack'],
            },
            { isMinimized: true },
        );
        expect(screen.queryByText(/Getting started/)).toBeNull();
    });

    it('offers restore on skipped rows and skip on every open step but the warehouse', async () => {
        const onSkip = vi.fn();
        const onRestore = vi.fn();
        const { unmount } = renderGuide(someSkipped, { onSkip, onRestore });
        expect(screen.getAllByText('Skipped')).toHaveLength(2);
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Add back Define metrics and dimensions',
            }),
        );
        expect(onRestore).toHaveBeenCalledWith(
            expect.objectContaining({ actionKey: 'add-semantic-layer' }),
        );
        unmount();

        renderGuide(fresh, { onSkip });
        expect(
            screen.queryByRole('button', {
                name: 'Skip Connect your warehouse',
            }),
        ).toBeNull();
        await userEvent.click(
            screen.getByRole('button', { name: 'Skip Connect Slack' }),
        );
        expect(onSkip).toHaveBeenCalledWith(
            expect.objectContaining({ actionKey: 'connect-slack' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Skip Invite your team' }),
        );
        expect(onSkip).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'invite-team', actionKey: null }),
        );
    });

    it('marks steps skipped in this browser as skipped', () => {
        expect(
            rowById({ ...fresh, skippedRows: ['brand'] }, 'brand')?.status,
        ).toBe('skipped');
    });

    it('minimizes to a pill and reopens from it', async () => {
        const onMinimizedChange = vi.fn();
        const { unmount } = renderGuide(fresh, { onMinimizedChange });
        await userEvent.click(
            screen.getByRole('button', { name: 'Minimize getting started' }),
        );
        expect(onMinimizedChange).toHaveBeenCalledWith(true);
        unmount();

        renderGuide(fresh, { isMinimized: true, onMinimizedChange });
        expect(
            screen.queryByRole('region', { name: 'Getting started' }),
        ).toBeNull();
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Getting started, 0 of 7 done',
            }),
        );
        expect(onMinimizedChange).toHaveBeenCalledWith(false);
    });
});

const eventsNamed = (name: EventName) =>
    track.mock.calls
        .map(([event]) => event)
        .filter((event) => event.name === name);

describe('setup guide tracking', () => {
    it('sends one impression per mount with progress', () => {
        const { rerender } = renderGuide(building);
        rerender(guideTree(building, { isMinimized: true }));
        expect(
            eventsNamed(EventName.HOMEPAGE_RECOMMENDED_ACTION_IMPRESSION),
        ).toEqual([
            {
                name: EventName.HOMEPAGE_RECOMMENDED_ACTION_IMPRESSION,
                properties: {
                    surface: 'setup_guide',
                    projectId: 'p1',
                    rowId: null,
                    actionKey: null,
                    choice: null,
                    completedCount: 1,
                    totalCount: 7,
                    isMinimized: false,
                },
            },
        ]);
    });

    it('reports every row click, with the choice when it fills the composer', async () => {
        const onAsk = vi.fn();
        renderGuide(fresh, { onAsk });
        await userEvent.click(
            screen.getByRole('link', { name: /Build your first chart/ }),
        );
        expect(onAsk).toHaveBeenCalled();
        await userEvent.click(
            screen.getByRole('link', { name: /Invite your team/ }),
        );
        expect(
            eventsNamed(EventName.HOMEPAGE_RECOMMENDED_ACTION_CLICKED).map(
                ({ properties }) => properties,
            ),
        ).toEqual([
            {
                surface: 'setup_guide',
                projectId: 'p1',
                rowId: 'first-chart',
                actionKey: null,
                choice: 'ask',
                destination: null,
            },
            {
                surface: 'setup_guide',
                projectId: 'p1',
                rowId: 'invite-team',
                actionKey: null,
                choice: null,
                destination: '/generalSettings/userManagement?to=invite',
            },
        ]);
    });
});

const bannerActions: RecommendedActionsState = {
    statuses: {
        'connect-warehouse': status({ isComplete: true }),
        'add-semantic-layer': status(),
        'connect-source-control': status(),
        'connect-slack': status(),
    },
    isLoading: false,
    skippedActions: [],
    skipAction: vi.fn(),
    restoreAction: vi.fn(),
    visibleActions: [],
    hasPendingActions: false,
};

const bannerGuide: SetupGuideState = {
    isEligible: true,
    isLoading: false,
    sections: [],
    semanticExplores: [],
    liveConnections: [],
    chartCount: 0,
    activeRun: null,
    completedRunUrl: null,
    isDismissed: false,
    setIsDismissed: vi.fn(),
    skipRow: vi.fn(),
    restoreRow: vi.fn(),
    skipAction: vi.fn(),
    restoreAction: vi.fn(),
};

const postHogConnection: ExternalConnectionListItem = {
    externalConnectionUuid: 'c1',
    projectUuid: 'p1',
    organizationUuid: 'o1',
    name: 'PostHog',
    slug: 'posthog',
    type: 'oauth_authorization_code',
    origin: 'https://us.posthog.com',
    instructions: null,
    allowedPathPrefixes: [],
    allowedMethods: ['GET'],
    allowedContentTypes: [],
    responseMaxBytes: 0,
    requestMaxBytes: 0,
    timeoutMs: 0,
    rateLimitPerMinute: null,
    apiKeyName: null,
    apiKeyLocation: null,
    oauthScopes: null,
    customHeaders: null,
    kind: 'live_source',
    apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '1' },
    hasSecret: true,
    createdByUserUuid: null,
    updatedByUserUuid: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    linkedDataAppCount: 0,
    linkedChartTypeCount: 0,
};

const renderBanner = (guide: SetupGuideState) =>
    render(
        <MantineProvider env="test">
            <MemoryRouter>
                <YourData
                    projectUuid="p1"
                    actions={bannerActions}
                    guide={guide}
                    onAsk={vi.fn()}
                />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('first chart banner', () => {
    it('stays hidden once the project has charts', () => {
        renderBanner({ ...bannerGuide, chartCount: 3 });
        expect(screen.queryByText('Build your first chart')).toBeNull();
    });

    it('shows on live sources alone, offering a warehouse', () => {
        render(
            <MantineProvider env="test">
                <MemoryRouter>
                    <YourData
                        projectUuid="p1"
                        actions={{
                            ...bannerActions,
                            statuses: {
                                ...bannerActions.statuses,
                                'connect-warehouse': status({
                                    url: '/settings',
                                }),
                            },
                        }}
                        guide={{
                            ...bannerGuide,
                            liveConnections: [postHogConnection],
                        }}
                        onAsk={vi.fn()}
                    />
                </MemoryRouter>
            </MantineProvider>,
        );
        expect(screen.getByText('Build your first chart')).toBeTruthy();
        expect(
            screen.getByRole('link', { name: /Connect a warehouse/ }),
        ).toHaveAttribute('href', '/settings');
    });

    it('reports the impression, an Explore pick and the dismiss', async () => {
        renderBanner(bannerGuide);
        await userEvent.click(
            screen.getByRole('link', { name: /Build in Explore/ }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Hide this card' }),
        );
        const banner = {
            surface: 'first_chart_banner',
            projectId: 'p1',
            rowId: 'first-chart',
            actionKey: null,
        };
        expect(track.mock.calls.map(([event]) => event)).toEqual([
            {
                name: EventName.HOMEPAGE_RECOMMENDED_ACTION_IMPRESSION,
                properties: { ...banner, choice: null },
            },
            {
                name: EventName.HOMEPAGE_RECOMMENDED_ACTION_CLICKED,
                properties: {
                    ...banner,
                    choice: 'explore',
                    destination: '/projects/p1/tables',
                },
            },
            {
                name: EventName.HOMEPAGE_RECOMMENDED_ACTION_SKIPPED,
                properties: { ...banner, choice: null },
            },
        ]);
        expect(
            screen.queryByRole('button', { name: 'Hide this card' }),
        ).toBeNull();
    });
});
