import { type LightdashUserWithAbilityRules } from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
    type DataAppAnalysisAvailability,
    type DataAppAnalysisUnavailableReason,
} from '../../../../../features/apps/analysis/useDataAppAnalysisAvailability';
import { type DataAppAnalysisController } from '../../../../../features/apps/analysis/useDataAppAnalysisController';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { type LauncherAnalysisAdapter } from './launcherAnalysisAdapter';
import { LauncherAnalysisPanel } from './LauncherAnalysisPanel';
import { LauncherPanelSizeContext } from './LauncherPanelSizeContext';

vi.mock('@uiw/react-md-editor', () => ({
    default: { Markdown: () => null },
}));

const anomaly = {
    id: 'anom-1',
    severity: 'high' as const,
    text: 'Returned orders doubled',
    queryUuid: 'q-1',
    fieldId: 'orders_total',
    dimensionValues: {},
    expected: null,
    actual: null,
};

const readyAnalysis = {
    analysisId: 'analysis-1',
    appUuid: 'app-1',
    appVersion: 1,
    sources: [{ queryUuid: 'q-1', label: 'Orders' }],
    generatedAt: new Date('2026-09-23T10:00:00Z'),
    headline: 'Returns are up',
    summary: 'Returned orders doubled in Q3.',
    anomalies: [anomaly],
    limitations: [],
    dataAsOf: null,
};

const available: DataAppAnalysisAvailability = {
    status: 'available',
    canContinueInAskAi: true,
    autoAnalyseDefault: false,
};

const unavailable = (
    reason: DataAppAnalysisUnavailableReason,
): DataAppAnalysisAvailability => ({ status: 'unavailable', reason });

const buildController = (
    overrides: Partial<DataAppAnalysisController> = {},
): DataAppAnalysisController =>
    ({
        sources: [{ queryUuid: 'q-1', label: 'Orders' }],
        inFlight: false,
        state: { status: 'ready', analysis: readyAnalysis, stale: false },
        investigations: {},
        analyse: vi.fn(),
        investigate: vi.fn(),
        agents: [{ uuid: 'agent-1', name: 'Analyst' }],
        agentsLoading: false,
        agentAccess: 'available',
        selectedAgentUuid: 'agent-1',
        rememberedAgentMissing: false,
        selectAgent: vi.fn(),
        investigateAnomaly: vi.fn(),
        continueInAskAi: vi.fn(),
        canContinueInAskAi: true,
        handleAction: vi.fn(),
        insightsPayload: null,
        setMountedQueryUuids: vi.fn(),
        mountedQueriesReported: false,
        ...overrides,
    }) as unknown as DataAppAnalysisController;

const buildAdapter = (
    availability: DataAppAnalysisAvailability,
    controller: DataAppAnalysisController,
): LauncherAnalysisAdapter => ({
    projectUuid: 'project-1',
    targetName: 'My app',
    availability,
    controller,
    highlightAvailable: false,
    onHoverQuery: vi.fn(),
});

const sizeContext = {
    previewSize: vi.fn(),
    commitSize: vi.fn(),
    resizeHintSeen: true,
    markResizeHintSeen: vi.fn(),
};

// The mocked user query resolves a tick after first render.
const userLoaded = () =>
    act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    });

const renderPanel = (
    availability: DataAppAnalysisAvailability,
    controller: DataAppAnalysisController,
    abilityRules: LightdashUserWithAbilityRules['abilityRules'] = [],
) =>
    renderWithProviders(
        <MemoryRouter>
            <Provider store={store}>
                <LauncherPanelSizeContext.Provider value={sizeContext}>
                    <LauncherAnalysisPanel
                        adapter={buildAdapter(availability, controller)}
                    />
                </LauncherPanelSizeContext.Provider>
            </Provider>
        </MemoryRouter>,
        { user: { abilityRules } },
    );

describe('LauncherAnalysisPanel unavailable states', () => {
    it('links an org admin to the toggle when the org setting is off', async () => {
        renderPanel(unavailable('org_setting_off'), buildController(), [
            { action: 'manage', subject: 'Organization' },
        ]);
        const link = await screen.findByRole('link', {
            name: 'Turn it on in settings',
        });
        expect(link).toHaveAttribute(
            'href',
            '/generalSettings/dataApps/aiAnalysis',
        );
        expect(screen.queryByText('Analyse this view')).toBeNull();
    });

    it('tells a viewer to ask an admin instead of linking the toggle', async () => {
        renderPanel(unavailable('org_setting_off'), buildController());
        expect(
            await screen.findByText('Ask an organization admin to turn it on.'),
        ).toBeInTheDocument();
        await userLoaded();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('offers nothing to fix when the org is not rolled out', async () => {
        renderPanel(unavailable('not_rolled_out'), buildController(), [
            { action: 'manage', subject: 'Organization' },
        ]);
        expect(
            await screen.findByText(
                'AI analysis is not available for this organization yet.',
            ),
        ).toBeInTheDocument();
        await userLoaded();
        expect(screen.queryByRole('link')).toBeNull();
    });
});

describe('LauncherAnalysisPanel without agent access', () => {
    it('lists anomalies but hides the agent picker and Investigate', async () => {
        renderPanel(
            available,
            buildController({
                agents: [],
                agentAccess: 'none',
                selectedAgentUuid: null,
            }),
        );
        expect(
            await screen.findByText('Returned orders doubled'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/don't have access to an AI agent/),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText('Agent for investigations')).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Investigate' }),
        ).toBeNull();
    });

    it('offers Investigate when the viewer has an agent', async () => {
        renderPanel(available, buildController());
        expect(
            await screen.findByRole('button', { name: 'Investigate' }),
        ).toBeEnabled();
        expect(
            screen.getAllByLabelText('Agent for investigations').length,
        ).toBeGreaterThan(0);
    });
});
