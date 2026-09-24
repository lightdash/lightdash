import { screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import BuilderCanvas from './BuilderCanvas';
import {
    type AttachedExplore,
    type ExploreSourceControls,
} from './exploreSource';
import {
    type AttachedSavedChart,
    type SavedChartSourceControls,
} from './savedChartSource';

vi.mock('../../apps/components/AppPreview', () => ({
    default: () => <div>Preview iframe</div>,
}));

const renderCanvas = (
    props: Partial<ComponentProps<typeof BuilderCanvas>> = {},
) =>
    renderWithProviders(
        <BuilderCanvas
            projectUuid="project-1"
            appUuid="app-1"
            previewVersion={1}
            isBuilding={false}
            failureMessage={null}
            isClarifyRoundOpen={false}
            clarifierUnavailable={false}
            previewContext={null}
            configurePanel={<div>Options panel</div>}
            onPickExample={null}
            onSdkManifest={vi.fn()}
            syncPreviewUrlState={false}
            elementPickerProps={{
                inspectorEnabled: false,
                onElementSelected: vi.fn(),
                onInspectorAvailabilityChange: vi.fn(),
                onInspectorCancelled: vi.fn(),
            }}
            previewRef={{ current: null }}
            onScreenshotAvailabilityChange={vi.fn()}
            {...props}
        />,
    );

const savedChartControls = (
    attached: AttachedSavedChart | null,
): SavedChartSourceControls => ({
    sourceIdentity: attached ? 'chart-a:0' : null,
    attached,
    previewSource: attached ? 'chart' : 'sample',
    includeRows: false,
    setIncludeRows: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    viewRows: vi.fn(),
    retry: vi.fn(),
});

const exploreControls = (
    attached: AttachedExplore | null,
): ExploreSourceControls => ({
    sourceIdentity: attached ? 'orders:0' : null,
    attached,
    previewSource: attached ? 'explore' : 'sample',
    includeRows: false,
    setIncludeRows: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    viewRows: vi.fn(),
    retry: vi.fn(),
});

const ORDERS: AttachedExplore = {
    name: 'orders',
    label: 'Orders',
    joinedTableLabels: [],
    fieldCount: 9,
    queriedFieldCount: 0,
    status: 'idle',
    isRunning: false,
    rowCount: null,
    ranAt: null,
    message: null,
};

const REVENUE: AttachedSavedChart = {
    uuid: 'chart-a',
    status: 'ready',
    chartName: 'Revenue by month',
    spaceName: 'Growth',
    rowCount: 24,
    columns: [],
    ranAt: new Date('2026-09-24T10:00:00Z'),
    message: null,
};

const renderStartPage = (
    props: Partial<ComponentProps<typeof BuilderCanvas>> = {},
) =>
    renderCanvas({
        appUuid: null,
        previewVersion: null,
        configurePanel: null,
        onPickExample: vi.fn(),
        savedChartSource: savedChartControls(null),
        exploreSource: exploreControls(null),
        ...props,
    });

const EXAMPLE = 'A funnel of signup steps';

const isBelow = (above: HTMLElement, below: HTMLElement) =>
    above.compareDocumentPosition(below) === Node.DOCUMENT_POSITION_FOLLOWING;

describe('BuilderCanvas start page', () => {
    it('offers the data sources below the examples while nothing is attached', () => {
        renderStartPage();

        expect(
            isBelow(
                screen.getByText(EXAMPLE),
                screen.getByRole('button', { name: 'Choose table' }),
            ),
        ).toBe(true);
        expect(screen.getByText('Preview data (optional)')).toBeInTheDocument();
    });

    it('keeps an attached table below the examples, under a preview data label', () => {
        renderStartPage({ exploreSource: exploreControls(ORDERS) });

        expect(
            isBelow(screen.getByText(EXAMPLE), screen.getByText('Orders')),
        ).toBe(true);
        expect(screen.getByText('Preview data')).toBeInTheDocument();
        expect(
            screen.queryByText('Preview data (optional)'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Choose table' }),
        ).not.toBeInTheDocument();
    });

    it('keeps an attached saved chart below the examples', () => {
        renderStartPage({ savedChartSource: savedChartControls(REVENUE) });

        expect(
            isBelow(
                screen.getByText(EXAMPLE),
                screen.getByText('Revenue by month'),
            ),
        ).toBe(true);
        expect(screen.getByText('Preview data')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Choose saved chart' }),
        ).not.toBeInTheDocument();
    });
});

describe('BuilderCanvas', () => {
    it('renders the preview before the configure panel in the DOM', () => {
        renderCanvas();

        const preview = screen.getByText('Preview iframe');
        const panel = screen.getByText('Options panel');
        expect(preview.compareDocumentPosition(panel)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
    });

    it('leaves the preview free of a sample-data header', () => {
        renderCanvas();

        expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
        expect(screen.queryByText('Made-up rows.')).not.toBeInTheDocument();
    });

    it('renders the preview without a configure panel', () => {
        renderCanvas({ configurePanel: null });

        expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
    });
});
