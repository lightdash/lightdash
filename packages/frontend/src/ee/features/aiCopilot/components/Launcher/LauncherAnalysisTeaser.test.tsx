import { type DataAppAnalysis } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type DataAppAnalysisController } from '../../../../../features/apps/analysis/useDataAppAnalysisController';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { resetActivePanel } from '../../store/aiAgentLauncherSlice';
import { type LauncherAnalysisAdapter } from './launcherAnalysisAdapter';
import { AnalysisTeaserContent } from './LauncherAnalysisTeaser';

const analyse = vi.fn();

const analysis: DataAppAnalysis = {
    analysisId: 'analysis-1',
    appUuid: 'app-1',
    appVersion: 1,
    sources: [{ queryUuid: 'q1', label: 'Revenue' }],
    generatedAt: new Date(),
    headline: 'Revenue dipped on Friday',
    summary: 'A summary',
    anomalies: [
        {
            id: 'a1',
            severity: 'high',
            text: 'Friday revenue 40% below median',
            queryUuid: 'q1',
            fieldId: 'revenue',
            dimensionValues: {},
            expected: null,
            actual: null,
        },
        {
            id: 'a2',
            severity: 'medium',
            text: 'Orders flat week over week',
            queryUuid: 'q1',
            fieldId: 'orders',
            dimensionValues: {},
            expected: null,
            actual: null,
        },
        {
            id: 'a3',
            severity: 'info',
            text: 'A third finding',
            queryUuid: 'q1',
            fieldId: 'aov',
            dimensionValues: {},
            expected: null,
            actual: null,
        },
    ],
    limitations: [],
    dataAsOf: null,
};

const buildAdapter = (
    controller: Partial<DataAppAnalysisController>,
    availabilityStatus: 'available' | 'unavailable' = 'available',
): LauncherAnalysisAdapter => ({
    projectUuid: 'project-1',
    targetName: 'My app',
    availability:
        availabilityStatus === 'available'
            ? {
                  status: 'available',
                  autoAnalyseDefault: false,
                  canContinueInAskAi: true,
              }
            : { status: 'unavailable', reason: 'org_setting_off' },
    controller: {
        sources: [{ queryUuid: 'q1', label: 'Revenue' }],
        inFlight: false,
        state: { status: 'idle' },
        analyse,
        ...controller,
    } as DataAppAnalysisController,
    highlightAvailable: false,
    onHoverQuery: vi.fn(),
});

const renderTeaser = (adapter: LauncherAnalysisAdapter) =>
    renderWithProviders(
        <Provider store={store}>
            <AnalysisTeaserContent adapter={adapter} />
        </Provider>,
    );

describe('AnalysisTeaserContent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        store.dispatch(resetActivePanel());
    });

    const expectNoTeaser = () => {
        expect(
            screen.queryByRole('button', { name: 'Analyse this view' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Insights on this view'),
        ).not.toBeInTheDocument();
    };

    it('renders nothing when availability gates fail', () => {
        renderTeaser(buildAdapter({}, 'unavailable'));
        expectNoTeaser();
    });

    it('renders nothing while queries are settling', () => {
        renderTeaser(buildAdapter({ inFlight: true }));
        expectNoTeaser();
    });

    it('renders nothing on an analysis error', () => {
        renderTeaser(
            buildAdapter({ state: { status: 'error', message: 'nope' } }),
        );
        expectNoTeaser();
    });

    it('lookup miss: the CTA runs detect and opens the analysis panel', () => {
        renderTeaser(buildAdapter({}));
        fireEvent.click(
            screen.getByRole('button', { name: 'Analyse this view' }),
        );
        expect(analyse).toHaveBeenCalledTimes(1);
        expect(store.getState().aiAgentLauncher.view).toBe('analysis');
        expect(store.getState().aiAgentLauncher.mode).toBe('panel-open');
    });

    it('lookup hit: shows headline, top findings and the overflow count', () => {
        renderTeaser(
            buildAdapter({
                state: { status: 'ready', analysis, stale: false },
            }),
        );
        expect(
            screen.getByText('Revenue dipped on Friday'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Friday revenue 40% below median'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Orders flat week over week'),
        ).toBeInTheDocument();
        expect(screen.queryByText('A third finding')).not.toBeInTheDocument();
        expect(screen.getByText('+1 more')).toBeInTheDocument();
    });

    it('lookup hit: Open analysis switches to the analysis view without re-running', () => {
        renderTeaser(
            buildAdapter({
                state: { status: 'ready', analysis, stale: false },
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Open analysis' }));
        expect(analyse).not.toHaveBeenCalled();
        expect(store.getState().aiAgentLauncher.view).toBe('analysis');
    });

    it('lookup hit: Re-run is disabled while queries are settling', () => {
        renderTeaser(
            buildAdapter({
                state: { status: 'ready', analysis, stale: false },
                inFlight: true,
            }),
        );
        expect(screen.getByRole('button', { name: 'Re-run' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Open analysis' }),
        ).toBeEnabled();
    });

    it('lookup hit: Re-run regenerates and opens the analysis panel', () => {
        renderTeaser(
            buildAdapter({
                state: { status: 'ready', analysis, stale: false },
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Re-run' }));
        expect(analyse).toHaveBeenCalledTimes(1);
        expect(store.getState().aiAgentLauncher.view).toBe('analysis');
    });
});
