import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type DataAppVizField,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ChartInputsPanel from './ChartInputsPanel';

const dimension = (name: string): CompiledDimension => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'customers',
    tableLabel: 'Customers',
    sql: '',
    hidden: false,
});

const metric = (name: string): CompiledMetric => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name,
    label: name,
    table: 'customers',
    tableLabel: 'Customers',
    sql: '',
    hidden: false,
});

const itemsMap: ItemsMap = {
    customers_channel: dimension('channel'),
    customers_plan: dimension('plan'),
    customers_count: metric('count'),
};

const fields: DataAppVizField[] = [
    { name: 'source', label: 'Source', type: 'dimension', required: true },
    { name: 'value', label: 'Value', type: 'metric', required: true },
];

const metricQuery: MetricQuery = {
    exploreName: 'customers',
    dimensions: ['customers_channel'],
    metrics: ['customers_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const renderPanel = (
    props: Partial<React.ComponentProps<typeof ChartInputsPanel>> = {},
) =>
    renderWithProviders(
        <ChartInputsPanel
            fields={fields}
            itemsMap={itemsMap}
            fieldMapping={{
                source: 'customers_channel',
                value: 'customers_count',
            }}
            exploreLabel="Customers"
            onChangeExplore={null}
            metricQuery={metricQuery}
            run={{ status: 'notRun' }}
            fit={{ status: 'fits' }}
            onSetField={vi.fn()}
            onRun={vi.fn()}
            {...props}
        />,
    );

describe('ChartInputsPanel', () => {
    it('binds each declared input to a select over the explore', () => {
        renderPanel();

        expect(screen.getByText('Explore')).toBeInTheDocument();
        expect(screen.getAllByText('Customers').length).toBeGreaterThan(0);
        expect(screen.getByText('Chart inputs')).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('Select source'),
        ).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Select value')).toBeInTheDocument();
    });

    it('offers the explore for change only when no saved chart fixes it', () => {
        const onChangeExplore = vi.fn();
        const { rerender } = renderPanel();
        expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();

        rerender(
            <ChartInputsPanel
                fields={fields}
                itemsMap={itemsMap}
                fieldMapping={{}}
                exploreLabel="Customers"
                onChangeExplore={onChangeExplore}
                metricQuery={metricQuery}
                run={{ status: 'notRun' }}
                fit={{ status: 'fits' }}
                onSetField={vi.fn()}
                onRun={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));

        expect(onChangeExplore).toHaveBeenCalledOnce();
    });

    it('offers to run once and summarises the query', () => {
        const onRun = vi.fn();
        renderPanel({ onRun });

        expect(screen.getByText('Not run yet.')).toBeInTheDocument();
        expect(screen.getByText('Query · Limit 500')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Run query' }));

        expect(onRun).toHaveBeenCalledOnce();
    });

    it('counts the filters a saved chart brought with it', () => {
        renderPanel({
            metricQuery: {
                ...metricQuery,
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'rule-1',
                                target: { fieldId: 'customers_channel' },
                                operator: 'equals',
                                values: ['organic'],
                            },
                        ],
                    },
                } as MetricQuery['filters'],
            },
        });

        expect(
            screen.getByText('Query · Limit 500, 1 filter'),
        ).toBeInTheDocument();
    });

    it('reports how many rows the last run returned', () => {
        renderPanel({
            run: {
                status: 'ready',
                rows: [],
                itemsMap,
                pivotDetails: null,
                rowCount: 12,
                ranAt: new Date(),
            },
        });

        expect(screen.getByText('Shape fits: 12 rows.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Run query' })).toBeNull();
    });

    it('offers a retry rather than claiming nothing ran', () => {
        renderPanel({ run: { status: 'error', message: 'Table not found' } });

        expect(screen.queryByText('Not run yet.')).toBeNull();
        expect(screen.getByText('The last run failed.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Run query' })).toBeEnabled();
    });

    it('says when the explore behind the selection cannot be read', () => {
        renderPanel({
            itemsMap: {},
            fit: {
                status: 'unavailable',
                message: 'You do not have access to this explore.',
            },
        });

        expect(
            screen.getByText('You do not have access to this explore.'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Run query' }),
        ).toBeDisabled();
        expect(screen.getByPlaceholderText('Select source')).toBeDisabled();
    });

    it('explains the input that does not fit and holds the run back', () => {
        renderPanel({
            fieldMapping: {
                source: 'customers_channel',
                value: 'customers_plan',
            },
            fit: {
                status: 'doesNotFit',
                issues: [
                    {
                        fieldName: 'value',
                        label: 'Value',
                        expects: 'metric',
                        mapped: {
                            fieldId: 'customers_plan',
                            kind: 'dimension',
                        },
                    },
                ],
            },
        });

        expect(screen.getByText('Value needs a metric.')).toBeInTheDocument();
        expect(
            screen.getByText(
                'plan is a dimension, so the chart has no value to size itself by.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('1 input to fix.')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Run query' }),
        ).toBeDisabled();
    });
});
