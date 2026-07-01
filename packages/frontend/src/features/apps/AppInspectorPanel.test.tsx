// AppInspectorPanel.test.tsx
import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AppInspectorPanel from './AppInspectorPanel';
import type { ExternalRequestEvent } from './hooks/useAppSdkBridge';

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

const baseExternalRequest: ExternalRequestEvent = {
    id: 'ext-1',
    timestamp: 0,
    alias: 'stripe',
    method: 'GET',
    path: '/v1/charges',
    query: null,
    requestBody: null,
    status: 'ready',
    httpStatus: 200,
    contentType: 'application/json',
    responseBody: { ok: true },
    truncated: false,
    durationMs: 42,
    error: null,
};

const renderPanel = (
    props: Partial<React.ComponentProps<typeof AppInspectorPanel>>,
) =>
    render(
        <MantineProvider>
            <AppInspectorPanel
                queries={[baseQuery]}
                externalRequests={[]}
                projectUuid="p-1"
                onClearQueries={() => {}}
                onClearExternalRequests={() => {}}
                onDismiss={() => {}}
                {...props}
            />
        </MantineProvider>,
    );

describe('AppInspectorPanel lineage hooks', () => {
    it('calls onHoverQuery with the queryUuid on hover and null on leave', () => {
        const onHoverQuery = vi.fn();
        renderPanel({ onHoverQuery, defaultCollapsed: false });
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
            renderPanel({
                focusedQueryUuid: 'q-1',
                defaultCollapsed: false,
            });
            expect(scrollIntoViewMock).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'nearest',
            });
        });

        it('does NOT scroll when focusedQueryUuid does not match any row', () => {
            renderPanel({
                focusedQueryUuid: 'does-not-exist',
                defaultCollapsed: false,
            });
            expect(scrollIntoViewMock).not.toHaveBeenCalled();
        });

        it('applies the focused CSS class to the matching row', () => {
            renderPanel({
                focusedQueryUuid: 'q-1',
                defaultCollapsed: false,
            });
            const row = document.querySelector('[data-query-uuid="q-1"]')!;
            expect(row.className).toMatch(/queryRowFocused/);
        });

        it('auto-uncollapses the panel when a matching focusedQueryUuid arrives', async () => {
            // Panel starts collapsed (defaultCollapsed defaults to true).
            // The effect should call setCollapsed(false) because 'q-1' matches
            // a query in the list, making the row visible.
            renderPanel({ focusedQueryUuid: 'q-1' });
            await waitFor(() =>
                expect(screen.getByText('Revenue')).toBeVisible(),
            );
        });
    });

    describe('inspect data toggle', () => {
        it('calls onToggleLineage when the header toggle is clicked', () => {
            const onToggleLineage = vi.fn();
            renderPanel({
                onToggleLineage,
                lineageAvailable: true,
                defaultCollapsed: false,
            });
            fireEvent.click(
                screen.getByLabelText('Toggle data lineage inspector'),
            );
            expect(onToggleLineage).toHaveBeenCalledTimes(1);
        });

        it('disables the toggle when lineage is unavailable', () => {
            renderPanel({
                onToggleLineage: vi.fn(),
                lineageAvailable: false,
                defaultCollapsed: false,
            });
            expect(
                screen.getByLabelText('Toggle data lineage inspector'),
            ).toBeDisabled();
        });
    });
});

describe('AppInspectorPanel external requests tab', () => {
    it('always shows the requests tab, even with none', () => {
        renderPanel({ externalRequests: [], defaultCollapsed: false });
        expect(screen.getByText('Requests (0)')).toBeInTheDocument();
    });

    it('reflects the request count in the tab label', () => {
        renderPanel({
            externalRequests: [baseExternalRequest],
            defaultCollapsed: false,
        });
        expect(screen.getByText('Requests (1)')).toBeInTheDocument();
    });

    it('switches to the requests tab and renders the request', () => {
        renderPanel({
            externalRequests: [baseExternalRequest],
            defaultCollapsed: false,
        });
        fireEvent.click(screen.getByText('Requests (1)'));
        // Rendered in the row header (Mantine Collapse keeps the expanded
        // detail mounted, so the same text can also appear there).
        expect(screen.getAllByText('GET /v1/charges').length).toBeGreaterThan(
            0,
        );
    });

    it('clears the active tab: external requests when the requests tab is active', () => {
        const onClearQueries = vi.fn();
        const onClearExternalRequests = vi.fn();
        renderPanel({
            externalRequests: [baseExternalRequest],
            onClearQueries,
            onClearExternalRequests,
            defaultCollapsed: false,
        });
        fireEvent.click(screen.getByText('Requests (1)'));
        fireEvent.click(screen.getByLabelText('Clear external requests'));
        expect(onClearExternalRequests).toHaveBeenCalledTimes(1);
        expect(onClearQueries).not.toHaveBeenCalled();
    });
});
