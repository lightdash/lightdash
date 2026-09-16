import { ChartType, type DocumentCellV3 } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import DocumentChart from './DocumentChart';

const mocks = vi.hoisted(() => ({
    query: { error: undefined as unknown, data: {} as unknown },
}));

vi.mock('./useDocument', () => ({
    useDocumentCellQuery: () => mocks.query,
}));
vi.mock('../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: () => ({}),
}));
vi.mock('../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({}),
}));
vi.mock('../../hooks/useResizeObserver', () => ({
    useResizeObserver: () => [undefined, { width: 400, height: 300 }],
}));
vi.mock('../../components/MetricQueryData/MetricQueryDataProvider', () => ({
    default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock(
    '../../components/LightdashVisualization/VisualizationProvider',
    () => ({
        default: ({ children }: { children: ReactNode }) => children,
    }),
);
vi.mock('../../components/LightdashVisualization', () => ({
    default: () => <div>Visualization</div>,
}));

const renderChart = () => {
    const cell: Extract<DocumentCellV3, { type: 'chart' }> = {
        id: 'orders',
        type: 'chart',
        content: {
            source: 'semantic',
            chart: {
                name: 'Orders',
                description: 'Daily order volume',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    tableCalculations: [],
                    limit: 100,
                },
                chartConfig: { type: ChartType.TABLE },
            },
        },
    };
    return render(
        <MantineProvider env="test">
            <DocumentChart
                projectUuid="project"
                spaceUuid="space"
                documentUuid="document"
                versionUuid="version"
                cell={cell}
            />
        </MantineProvider>,
    );
};

describe('Document chart titles', () => {
    beforeEach(() => {
        mocks.query.error = undefined;
        mocks.query.data = {};
    });

    test('omits a duplicate frame name while preserving the accessible figure name', () => {
        renderChart();
        expect(screen.queryByText('Orders')).not.toBeInTheDocument();
        expect(
            screen.getByRole('figure', { name: 'Orders' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Visualization')).toBeInTheDocument();
    });

    test('retains framed query errors', () => {
        mocks.query.error = { error: { message: 'Query failed' } };
        renderChart();
        expect(
            screen.getByText(
                'The live data for this chart could not be loaded.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText('Visualization')).not.toBeInTheDocument();
    });

    test.each(['loading', 'error', 'success'])(
        'preserves the description exactly once while %s',
        (state) => {
            if (state === 'loading') {
                mocks.query.data = undefined;
            }
            if (state === 'error') {
                mocks.query.error = { error: { message: 'Query failed' } };
            }
            renderChart();
            expect(screen.getAllByText('Daily order volume')).toHaveLength(1);
        },
    );

    test('does not advertise an unavailable Explore action for warehouse query limits', () => {
        mocks.query.error = {
            error: { message: 'Query exceeded resource limits' },
        };
        renderChart();
        expect(
            screen.getByText('This chart exceeds the warehouse query limit.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/Open it in Explore/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /retry/i }),
        ).not.toBeInTheDocument();
    });
});
