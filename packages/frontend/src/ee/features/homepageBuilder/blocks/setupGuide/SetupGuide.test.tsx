import {
    type AgentOnboardingRun,
    type HomepageRecommendedActionKey,
    type OrganizationBrand,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { type ActionStatus } from '../useRecommendedActions';
import { SetupGuideView } from './SetupGuide';
import {
    buildSetupGuide,
    countProgress,
    type SetupGuideFacts,
    type SetupGuideRow,
} from './setupGuideModel';

vi.mock('../../../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

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
    semanticModelCount: 0,
    activeRun: null,
    completedRun: null,
    appSourceNames: [],
    starterDashboard: null,
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
    appSourceNames: ['PostHog'],
    starterDashboard: { uuid: 'd1', name: 'Product overview' },
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

const renderGuide = (
    facts: SetupGuideFacts,
    handlers: {
        onSkip?: (key: HomepageRecommendedActionKey) => void;
        onDismissedChange?: (isDismissed: boolean) => void;
        isDismissed?: boolean;
    } = {},
) =>
    render(
        <MantineProvider env="test">
            <MemoryRouter>
                <SetupGuideView
                    sections={buildSetupGuide(facts)}
                    isDismissed={handlers.isDismissed ?? false}
                    onDismissedChange={handlers.onDismissedChange ?? vi.fn()}
                    onSkip={handlers.onSkip ?? vi.fn()}
                    onRestore={vi.fn()}
                    highlight={[]}
                />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('buildSetupGuide', () => {
    it('groups rows into outcome sections, hiding integrations the instance lacks', () => {
        const sections = buildSetupGuide(fresh);
        expect(sections.map(({ title }) => title)).toEqual([
            'Your data',
            'Your semantic layer',
            'Starter content',
            'Your team',
        ]);
        expect(rowById(fresh, 'source-control')).toBeUndefined();
        expect(rowById(fresh, 'slack')).toBeDefined();
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
        expect(rowById(building, 'starter-dashboard')?.status).toBe('building');
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

    it('completes every row once everything exists', () => {
        expect(countProgress(rowsOf(allDone))).toEqual({
            completed: 7,
            total: 7,
        });
        expect(rowById(allDone, 'starter-dashboard')).toMatchObject({
            status: 'ready',
            action: { label: 'Review', to: '/projects/p1/dashboards/d1' },
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
    it('renders a fresh guide with quiet progress and per-section counts', () => {
        renderGuide(fresh);
        expect(screen.getByText('Set up your workspace')).toBeInTheDocument();
        expect(screen.getByText('0 / 7 completed')).toBeInTheDocument();
        expect(screen.getAllByText('Suggested')).toHaveLength(7);
    });

    it('expands a building row to show run progress', async () => {
        renderGuide(building);
        expect(screen.getAllByText('Building')).toHaveLength(2);
        await userEvent.click(
            screen.getByRole('button', { name: 'Show progress' }),
        );
        expect(
            screen.getByRole('list', { name: 'Setup stages' }),
        ).toBeInTheDocument();
    });

    it('shows evidence while one step is left', () => {
        renderGuide({ ...allDone, teammateCount: 0 });
        expect(screen.getByText('6 / 7 completed')).toBeInTheDocument();
        expect(
            screen.getByText('48 models ready to explore'),
        ).toBeInTheDocument();
        expect(screen.getByText('PostHog connected')).toBeInTheDocument();
        expect(screen.getAllByText('Suggested')).toHaveLength(1);
        expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('hides once nothing is pending, counting skipped as settled', () => {
        renderGuide(allDone);
        expect(screen.queryByText('Set up your workspace')).toBeNull();

        renderGuide(
            {
                ...allDone,
                statuses: { ...allDone.statuses, 'connect-slack': status() },
                skippedActions: ['connect-slack'],
            },
            { isDismissed: true },
        );
        expect(screen.queryByText(/Setup guide/)).toBeNull();
    });

    it('offers restore on skipped rows and skip on skippable suggestions', async () => {
        const onSkip = vi.fn();
        renderGuide(someSkipped, { onSkip });
        expect(screen.getAllByText('Skipped')).toHaveLength(2);
        expect(
            screen.getByRole('button', {
                name: 'Restore Define metrics and dimensions',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Skip Invite your team' }),
        ).toBeNull();

        renderGuide(fresh, { onSkip });
        await userEvent.click(
            screen.getByRole('button', { name: 'Skip Connect Slack' }),
        );
        expect(onSkip).toHaveBeenCalledWith('connect-slack');
    });

    it('collapses to a quiet entry point when dismissed', async () => {
        const onDismissedChange = vi.fn();
        const { unmount } = renderGuide(fresh, { onDismissedChange });
        await userEvent.click(
            screen.getByRole('button', { name: 'Hide setup guide' }),
        );
        expect(onDismissedChange).toHaveBeenCalledWith(true);
        unmount();

        renderGuide(fresh, { isDismissed: true, onDismissedChange });
        const reopen = screen.getByRole('button', {
            name: /Setup guide · 0 \/ 7 completed/,
        });
        expect(
            within(document.body).queryByText('Set up your workspace'),
        ).toBeNull();
        await userEvent.click(reopen);
        expect(onDismissedChange).toHaveBeenCalledWith(false);
    });
});
