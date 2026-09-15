import { ChartType, type DocumentCellV2 } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import DocumentChart from './DocumentChart';

const mocks = vi.hoisted(() => ({ query: { error: undefined as unknown } }));

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

const renderChart = (title?: string) => {
    const cell: Extract<DocumentCellV2, { type: 'chart' }> = {
        id: 'orders',
        type: 'chart',
        content: {
            title,
            source: 'semantic',
            chart: {
                name: 'Orders',
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
    });

    test('omits a duplicate frame name while preserving the accessible figure name', () => {
        renderChart('Orders');
        expect(screen.queryByText('Orders')).not.toBeInTheDocument();
        expect(
            screen.getByRole('figure', { name: 'Orders' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Visualization')).toBeInTheDocument();
    });

    test.each([undefined, 'Order trends'])(
        'retains the chart name when the section title is %s',
        (title) => {
            renderChart(title);
            expect(screen.getByText('Orders')).toBeInTheDocument();
            expect(
                screen.getByRole('figure', { name: 'Orders' }),
            ).toBeInTheDocument();
        },
    );

    test('retains the existing query error message', () => {
        mocks.query.error = { error: { message: 'Query failed' } };
        renderChart('Orders');
        expect(
            screen.getByText('Unable to load chart: Query failed'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Visualization')).not.toBeInTheDocument();
    });
});
