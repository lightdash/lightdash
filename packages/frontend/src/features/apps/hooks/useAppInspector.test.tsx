import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppInspectorPanel from '../AppInspectorPanel';
import { useAppInspector, type UseAppInspectorResult } from './useAppInspector';
import type { ExternalRequestEvent, QueryEvent } from './useAppSdkBridge';

// Stands in for the SDK bridge: the harness publishes the callbacks the hook
// hands to `AppIframePreview`, and tests feed events through them.
let inspector: UseAppInspectorResult;

const Host: FC<{ identityKey: string }> = ({ identityKey }) => {
    inspector = useAppInspector({ identityKey, defaultHidden: false });
    if (inspector.hidden) return null;
    return <AppInspectorPanel projectUuid="p-1" {...inspector.panelProps} />;
};

const renderHost = (identityKey = 'app:1') =>
    render(
        <MantineProvider env="test">
            <Host identityKey={identityKey} />
        </MantineProvider>,
    );

const rerenderHost = (
    rerender: (ui: React.ReactElement) => void,
    identityKey: string,
) =>
    rerender(
        <MantineProvider env="test">
            <Host identityKey={identityKey} />
        </MantineProvider>,
    );

const queryEvent = (
    overrides: Partial<QueryEvent> & Pick<QueryEvent, 'id' | 'status'>,
): QueryEvent => ({
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
    queryUuid: null,
    rowCount: null,
    durationMs: null,
    error: null,
    rawMetricQuery: null,
    ...overrides,
});

const externalRequestEvent: ExternalRequestEvent = {
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

const emitQuery = (event: QueryEvent) =>
    act(() => inspector.iframeProps.onQueryEvent(event));

describe('useAppInspector', () => {
    beforeEach(() => {
        window.localStorage.clear();
        // jsdom has no scrollIntoView; the focused row calls it.
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('stays out of the way until the app issues its first query', () => {
        renderHost();
        expect(screen.queryByText(/Queries \(/)).not.toBeInTheDocument();

        emitQuery(queryEvent({ id: 'r1', status: 'pending' }));

        expect(screen.getByText('Queries (1)')).toBeInTheDocument();
        expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it('rolls a query row through its status transitions', () => {
        renderHost();
        emitQuery(queryEvent({ id: 'r1', status: 'pending' }));
        emitQuery(
            queryEvent({
                id: 'r1',
                status: 'ready',
                queryUuid: 'q-1',
                rowCount: 3,
                durationMs: 20,
            }),
        );

        expect(screen.getByText('Queries (1)')).toBeInTheDocument();
        expect(screen.getByText('ready')).toBeInTheDocument();
        expect(screen.getByText('3 rows')).toBeInTheDocument();
        expect(inspector.readyQueryCount).toBe(1);
    });

    it('counts external-connection requests on the Requests tab', () => {
        renderHost();
        act(() =>
            inspector.iframeProps.onExternalRequestEvent(externalRequestEvent),
        );
        expect(screen.getByText('Requests (1)')).toBeInTheDocument();
    });

    it('clears the log when a new app version lands, dropping late events from the old one', () => {
        const { rerender } = renderHost('app:1');
        emitQuery(queryEvent({ id: 'r1', status: 'pending' }));
        act(() =>
            inspector.iframeProps.onExternalRequestEvent(externalRequestEvent),
        );

        rerenderHost(rerender, 'app:2');
        expect(screen.queryByText(/Queries \(/)).not.toBeInTheDocument();

        emitQuery(queryEvent({ id: 'r1', status: 'ready', queryUuid: 'q-1' }));
        expect(screen.queryByText(/Queries \(/)).not.toBeInTheDocument();
        expect(inspector.readyQueryCount).toBe(0);
    });

    it('keeps the log across versions when Persist is on, interrupting in-flight rows', () => {
        const { rerender } = renderHost('app:1');
        emitQuery(queryEvent({ id: 'r0', status: 'ready', queryUuid: 'q-0' }));
        emitQuery(queryEvent({ id: 'r1', status: 'pending' }));
        // The switch lives in the expanded title bar.
        fireEvent.click(screen.getByText('Queries (2)'));
        fireEvent.click(screen.getByLabelText('Persist'));

        rerenderHost(rerender, 'app:2');

        expect(screen.getByText('Queries (2)')).toBeInTheDocument();
        expect(screen.getByText('error')).toBeInTheDocument();
        // Only queries since the version switch count towards the live gate.
        expect(inspector.readyQueryCount).toBe(0);
        emitQuery(queryEvent({ id: 'r2', status: 'ready', queryUuid: 'q-2' }));
        expect(inspector.readyQueryCount).toBe(1);
    });

    it('re-opens the panel and focuses the row when the app reports a lineage selection', () => {
        renderHost();
        emitQuery(queryEvent({ id: 'r1', status: 'ready', queryUuid: 'q-1' }));
        fireEvent.click(screen.getByLabelText('Close inspector panel'));
        expect(screen.queryByText(/Queries \(/)).not.toBeInTheDocument();

        act(() =>
            inspector.iframeProps.onLineageSelected({ queryUuid: 'q-1' }),
        );

        const row = document.querySelector('[data-query-uuid="q-1"]')!;
        expect(row.className).toMatch(/queryRowFocused/);
        expect(inspector.iframeProps.lineageHighlightQueryUuid).toBe('q-1');
    });
});
