import { QueryExecutionContext, WarehouseTypes } from '@lightdash/common';
import { QueryCompletedEvent } from '../LightdashAnalytics';
import { EventStreamSink } from './EventStreamSink';
import { EVENT_STREAM_SCHEMA_VERSION } from './projection';
import { eventStreamRegistry } from './registry';
import { EventStreamRow } from './types';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

const createWriterMock = () => ({
    push: vi.fn<(stream: string, row: EventStreamRow) => void>(),
    flush: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
});

const queryCompletedEvent: QueryCompletedEvent = {
    event: 'query.completed',
    userId: 'user-1',
    properties: {
        queryId: 'query-1',
        organizationId: 'org-1',
        projectId: 'project-1',
        isPreviewProject: false,
        status: 'success',
        context: QueryExecutionContext.EXPLORE,
        exploreName: 'orders',
        chartId: 'chart-1',
        dashboardId: 'dashboard-1',
        cacheHit: false,
        executionSource: 'warehouse',
        warehouseType: WarehouseTypes.POSTGRES,
        warehouseExecutionTimeMs: 123,
        totalRowCount: 42,
        columnsCount: 5,
    },
};

describe('EventStreamSink', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('projects a successful query.completed event', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle(queryCompletedEvent);
        expect(writer.push).toHaveBeenCalledTimes(1);
        const [stream, row] = writer.push.mock.calls[0];
        expect(stream).toBe('query_events');
        expect(row).toMatchObject({
            event_name: 'query.completed',
            org_id: 'org-1',
            user_id: 'user-1',
            schema_version: EVENT_STREAM_SCHEMA_VERSION,
            project_id: 'project-1',
            query_id: 'query-1',
            status: 'success',
            context: QueryExecutionContext.EXPLORE,
            explore_name: 'orders',
            chart_id: 'chart-1',
            dashboard_id: 'dashboard-1',
            cache_hit: false,
            execution_source: 'warehouse',
            warehouse_type: WarehouseTypes.POSTGRES,
            warehouse_execution_time_ms: 123,
            total_row_count: 42,
            columns_count: 5,
        });
        expect(new Date(row.event_ts).toISOString()).toBe(row.event_ts);
    });

    it('projects an errored query.completed event with null outcome columns', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        const event: QueryCompletedEvent = {
            ...queryCompletedEvent,
            properties: {
                ...queryCompletedEvent.properties,
                status: 'error',
                warehouseType: null,
                executionSource: null,
                warehouseExecutionTimeMs: null,
                totalRowCount: null,
                columnsCount: null,
            },
        };
        sink.handle(event);
        expect(writer.push).toHaveBeenCalledTimes(1);
        const [, row] = writer.push.mock.calls[0];
        expect(row).toMatchObject({
            event_name: 'query.completed',
            status: 'error',
            warehouse_type: null,
            execution_source: null,
            warehouse_execution_time_ms: null,
            total_row_count: null,
            columns_count: null,
        });
    });

    it('drops events from preview projects', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle({
            ...queryCompletedEvent,
            properties: {
                ...queryCompletedEvent.properties,
                isPreviewProject: true,
            },
        });
        expect(writer.push).not.toHaveBeenCalled();
    });

    it('drops events without an organization id', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle({
            ...queryCompletedEvent,
            properties: {
                ...queryCompletedEvent.properties,
                organizationId: '',
            },
        });
        expect(writer.push).not.toHaveBeenCalled();
    });

    it('ignores events not in the registry', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle({
            event: 'query.executed',
            userId: 'user-1',
            properties: { organizationId: 'org-1', projectId: 'project-1' },
        });
        sink.handle({
            event: 'space.created',
            userId: 'user-1',
            properties: { name: 'My space' },
        });
        expect(writer.push).not.toHaveBeenCalled();
    });
});
