import { type DataAppVizSchema } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizTestPanel from './DataAppVizTestPanel';
import { buildTestMetricQuery, isMappingComplete } from './dataAppVizTestQuery';

vi.mock('../../../hooks/useExplores', () => ({
    useExplores: vi.fn(),
}));
vi.mock('../../../hooks/useExplore', () => ({
    useExploreByProjectUuid: vi.fn(),
}));
vi.mock('../../../providers/Explorer/useQueryExecutor', () => ({
    useQueryExecutor: vi.fn(),
}));

import { useExploreByProjectUuid } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useQueryExecutor } from '../../../providers/Explorer/useQueryExecutor';

const schema: DataAppVizSchema = {
    fields: [
        { name: 'source', label: 'Source', type: 'dimension', required: true },
        { name: 'target', label: 'Target', type: 'series', required: false },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
};

describe('isMappingComplete', () => {
    it('is false until every required field is mapped', () => {
        expect(isMappingComplete(schema, {})).toBe(false);
        expect(isMappingComplete(schema, { source: 'orders_status' })).toBe(
            false,
        );
        expect(
            isMappingComplete(schema, {
                source: 'orders_status',
                value: 'orders_total',
            }),
        ).toBe(true);
    });

    it('ignores unmapped optional fields', () => {
        expect(
            isMappingComplete(schema, {
                source: 'orders_status',
                value: 'orders_total',
                // `target` (optional) left unmapped
            }),
        ).toBe(true);
    });
});

describe('buildTestMetricQuery', () => {
    it('routes series/dimension fields to dimensions and metric fields to metrics', () => {
        const q = buildTestMetricQuery('orders', schema, {
            source: 'orders_status',
            target: 'orders_region',
            value: 'orders_total',
        });
        expect(q.exploreName).toBe('orders');
        expect(q.dimensions).toEqual(['orders_status', 'orders_region']);
        expect(q.metrics).toEqual(['orders_total']);
        expect(q.limit).toBe(500);
        expect(q.tableCalculations).toEqual([]);
    });

    it('drops unmapped fields', () => {
        const q = buildTestMetricQuery('orders', schema, {
            source: 'orders_status',
            value: 'orders_total',
        });
        expect(q.dimensions).toEqual(['orders_status']);
        expect(q.metrics).toEqual(['orders_total']);
    });
});

describe('DataAppVizTestPanel', () => {
    beforeEach(() => {
        vi.mocked(useExplores).mockReturnValue({
            data: [
                { name: 'orders', label: 'Orders' },
                { name: 'customers', label: 'Customers' },
            ],
        } as unknown as ReturnType<typeof useExplores>);
        vi.mocked(useExploreByProjectUuid).mockReturnValue({
            data: undefined,
        } as unknown as ReturnType<typeof useExploreByProjectUuid>);
        vi.mocked(useQueryExecutor).mockReturnValue([
            {
                query: { isFetching: false, error: null },
                queryResults: {
                    rows: [],
                    isFetchingFirstPage: false,
                    error: null,
                },
            },
            vi.fn(),
        ] as unknown as ReturnType<typeof useQueryExecutor>);
    });

    it('lists the declared fields and the explore picker up-front', () => {
        renderWithProviders(
            <DataAppVizTestPanel
                projectUuid="p1"
                schema={schema}
                onContextChange={vi.fn()}
            />,
        );

        expect(screen.getByText('Visualization ready')).toBeInTheDocument();
        expect(screen.getByText('Test with data')).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('Select an explore'),
        ).toBeInTheDocument();
        // Declared fields are visible before an explore is chosen.
        expect(screen.getByText('Source')).toBeInTheDocument();
        expect(screen.getByText('Value')).toBeInTheDocument();
    });

    it('hides the run action until an explore is selected', () => {
        renderWithProviders(
            <DataAppVizTestPanel
                projectUuid="p1"
                schema={schema}
                onContextChange={vi.fn()}
            />,
        );

        expect(
            screen.queryByRole('button', { name: /run test query/i }),
        ).not.toBeInTheDocument();
    });
});
