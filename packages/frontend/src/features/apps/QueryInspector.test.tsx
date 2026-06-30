// QueryInspector.test.tsx
import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    describe('focus reveal', () => {
        // jsdom does not implement scrollIntoView; install a vi.fn() on the
        // prototype for the duration of each test and clean it up afterwards
        // so it does not bleed into other suites.
        let scrollIntoViewMock: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            scrollIntoViewMock = vi.fn();
            Object.defineProperty(Element.prototype, 'scrollIntoView', {
                configurable: true,
                writable: true,
                value: scrollIntoViewMock,
            });
        });

        afterEach(() => {
            delete (Element.prototype as Partial<Element>).scrollIntoView;
        });

        it('scrolls the focused row into view with smooth behavior', () => {
            renderInspector({
                focusedQueryUuid: 'q-1',
                defaultCollapsed: false,
            });
            expect(scrollIntoViewMock).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'nearest',
            });
        });

        it('does NOT scroll when focusedQueryUuid does not match any row', () => {
            renderInspector({
                focusedQueryUuid: 'does-not-exist',
                defaultCollapsed: false,
            });
            expect(scrollIntoViewMock).not.toHaveBeenCalled();
        });

        it('applies the focused CSS class to the matching row', () => {
            renderInspector({
                focusedQueryUuid: 'q-1',
                defaultCollapsed: false,
            });
            const row = document.querySelector('[data-query-uuid="q-1"]')!;
            expect(row.className).toMatch(/queryRowFocused/);
        });

        it('auto-uncollapses the panel when a matching focusedQueryUuid arrives', async () => {
            // Panel starts collapsed (defaultCollapsed defaults to true).
            // The effect in QueryInspector should call setCollapsed(false)
            // because 'q-1' matches a query in the list, making the row visible.
            renderInspector({ focusedQueryUuid: 'q-1' });
            await waitFor(() =>
                expect(screen.getByText('Revenue')).toBeVisible(),
            );
        });
    });
});
