import { type LightdashUserWithAbilityRules } from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppAnalysisPanel from './DataAppAnalysisPanel';
import { type DataAppAnalysisAvailability } from './useDataAppAnalysisAvailability';
import { type DataAppAnalysisController } from './useDataAppAnalysisController';

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
            <DataAppAnalysisPanel
                opened
                onClose={vi.fn()}
                appUuid="app-1"
                availability={availability}
                controller={controller}
                lineageAvailable={false}
                onHoverQuery={vi.fn()}
            />
        </MemoryRouter>,
        { user: { abilityRules } },
    );

describe('DataAppAnalysisPanel unavailable states', () => {
    it('links an org admin to the toggle when the org setting is off', async () => {
        renderPanel(
            { status: 'unavailable', reason: 'org_setting_off' },
            buildController(),
            [{ action: 'manage', subject: 'Organization' }],
        );
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
        renderPanel(
            { status: 'unavailable', reason: 'org_setting_off' },
            buildController(),
        );
        expect(
            await screen.findByText('Ask an organization admin to turn it on.'),
        ).toBeInTheDocument();
        await userLoaded();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('offers nothing to fix when the org is not rolled out', async () => {
        renderPanel(
            { status: 'unavailable', reason: 'not_rolled_out' },
            buildController(),
            [{ action: 'manage', subject: 'Organization' }],
        );
        expect(
            await screen.findByText(
                'AI analysis is not available for this organization yet.',
            ),
        ).toBeInTheDocument();
        await userLoaded();
        expect(screen.queryByRole('link')).toBeNull();
    });
});

describe('DataAppAnalysisPanel without agent access', () => {
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
