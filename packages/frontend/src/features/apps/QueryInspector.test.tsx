// QueryInspector.test.tsx
import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen } from '@testing-library/react';
import QueryInspector from './QueryInspector';

const baseQuery = {
    id: '1',
    timestamp: 0,
    label: 'Revenue',
    exploreName: 'orders',
    dimensions: [],
    metrics: ['orders_revenue'],
    filters: {},
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    limit: 20,
    queryUuid: 'q-1',
    status: 'ready' as const,
    rowCount: 3,
    durationMs: 20,
    error: null,
    rawMetricQuery: null,
};

const renderInspector = (
    props: Partial<React.ComponentProps<typeof QueryInspector>>,
) =>
    render(
        <MantineProvider>
            <QueryInspector
                queries={[baseQuery]}
                projectUuid="p-1"
                onClear={() => {}}
                onDismiss={() => {}}
                {...props}
            />
        </MantineProvider>,
    );

describe('QueryInspector lineage hooks', () => {
    it('calls onHoverQuery with the queryUuid on hover and null on leave', () => {
        const onHoverQuery = vi.fn();
        renderInspector({ onHoverQuery });
        const row = document.querySelector('[data-query-uuid="q-1"]')!;
        fireEvent.mouseEnter(row);
        expect(onHoverQuery).toHaveBeenCalledWith('q-1');
        fireEvent.mouseLeave(row);
        expect(onHoverQuery).toHaveBeenCalledWith(null);
    });

    it('expands the focused query so its UUID is visible', () => {
        Element.prototype.scrollIntoView = vi.fn();
        renderInspector({ focusedQueryUuid: 'q-1' });
        expect(screen.getByText('q-1')).toBeInTheDocument();
    });
});
