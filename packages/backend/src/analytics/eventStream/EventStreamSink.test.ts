import { QueryExecutionContext, WarehouseTypes } from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import {
    LightdashAnalytics,
    QueryErrorEvent,
    QueryExecutionEvent,
    QueryReadyEvent,
} from '../LightdashAnalytics';
import { EventStreamSink } from './EventStreamSink';
import { EVENT_STREAM_SCHEMA_VERSION } from './projection';
import { eventStreamRegistry } from './registry';
import { EventStreamRow, EventStreamWriter } from './types';

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

const metricQueryProperties = {
    context: QueryExecutionContext.EXPLORE,
    organizationId: 'org-1',
    projectId: 'project-1',
    exploreName: 'orders',
    dashboardId: null,
    metricsCount: 1,
    dimensionsCount: 2,
    tableCalculationsCount: 0,
    tableCalculationsPercentFormatCount: 0,
    tableCalculationsCurrencyFormatCount: 0,
    tableCalculationsNumberFormatCount: 0,
    tableCalculationCustomFormatCount: 0,
    filtersCount: 0,
    sortsCount: 0,
    additionalMetricsCount: 0,
    additionalMetricsFilterCount: 0,
    additionalMetricsPercentFormatCount: 0,
    additionalMetricsCurrencyFormatCount: 0,
    additionalMetricsNumberFormatCount: 0,
    additionalMetricsCustomFormatCount: 0,
    numFixedWidthBinCustomDimensions: 0,
    numFixedBinsBinCustomDimensions: 0,
    numCustomRangeBinCustomDimensions: 0,
    numCustomSqlDimensions: 0,
    dateZoomGranularity: null,
    metricOverridesCount: 0,
    limit: 500,
    parametersCount: 0,
};

const queryReadyEvent: QueryReadyEvent = {
    event: 'query.ready',
    userId: 'user-1',
    properties: {
        queryId: 'query-1',
        organizationId: 'org-1',
        projectId: 'project-1',
        warehouseType: WarehouseTypes.POSTGRES,
        executionSource: 'warehouse',
        warehouseExecutionTimeMs: 123,
        totalRowCount: 42,
        columnsCount: 5,
    },
};

describe('EventStreamSink', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('projects a paginated metric query.executed event', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        const event: QueryExecutionEvent = {
            event: 'query.executed',
            userId: 'user-1',
            properties: {
                ...metricQueryProperties,
                dashboardId: 'dashboard-1',
                chartId: 'chart-1',
                queryId: 'query-1',
                warehouseType: WarehouseTypes.POSTGRES,
                executionSource: 'warehouse',
                cacheMetadata: {
                    cacheHit: false,
                    preAggregate: { hit: true },
                },
            },
        };
        sink.handle(event);
        expect(writer.push).toHaveBeenCalledTimes(1);
        const [stream, row] = writer.push.mock.calls[0];
        expect(stream).toBe('query_events');
        expect(row).toMatchObject({
            event_name: 'query.executed',
            org_id: 'org-1',
            user_id: 'user-1',
            schema_version: EVENT_STREAM_SCHEMA_VERSION,
            project_id: 'project-1',
            query_id: 'query-1',
            context: QueryExecutionContext.EXPLORE,
            execution_source: 'warehouse',
            warehouse_type: WarehouseTypes.POSTGRES,
            cache_hit: false,
            pre_aggregate_hit: true,
            explore_name: 'orders',
            chart_id: 'chart-1',
            dashboard_id: 'dashboard-1',
            sql_chart_id: null,
        });
        expect(new Date(row.event_ts).toISOString()).toBe(row.event_ts);
    });

    it('projects a non-paginated metric query.executed event with nulls', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        const event: QueryExecutionEvent = {
            event: 'query.executed',
            properties: { ...metricQueryProperties },
        };
        sink.handle(event);
        expect(writer.push).toHaveBeenCalledTimes(1);
        const [, row] = writer.push.mock.calls[0];
        expect(row).toMatchObject({
            user_id: null,
            query_id: null,
            warehouse_type: null,
            execution_source: null,
            cache_hit: null,
            pre_aggregate_hit: null,
            explore_name: 'orders',
            chart_id: null,
            dashboard_id: null,
            sql_chart_id: null,
        });
    });

    it('projects a sql runner query.executed event', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        const event: QueryExecutionEvent = {
            event: 'query.executed',
            userId: 'user-1',
            properties: {
                context: QueryExecutionContext.SQL_RUNNER,
                organizationId: 'org-1',
                projectId: 'project-1',
                sqlChartId: 'sql-chart-1',
                usingStreaming: true,
            },
        };
        sink.handle(event);
        expect(writer.push).toHaveBeenCalledTimes(1);
        const [, row] = writer.push.mock.calls[0];
        expect(row).toMatchObject({
            event_name: 'query.executed',
            org_id: 'org-1',
            project_id: 'project-1',
            context: QueryExecutionContext.SQL_RUNNER,
            query_id: null,
            warehouse_type: null,
            explore_name: null,
            chart_id: null,
            dashboard_id: null,
            sql_chart_id: 'sql-chart-1',
        });
    });

    it('projects a query.ready event', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle(queryReadyEvent);
        expect(writer.push).toHaveBeenCalledTimes(1);
        const [stream, row] = writer.push.mock.calls[0];
        expect(stream).toBe('query_events');
        expect(row).toMatchObject({
            event_name: 'query.ready',
            org_id: 'org-1',
            user_id: 'user-1',
            schema_version: EVENT_STREAM_SCHEMA_VERSION,
            project_id: 'project-1',
            query_id: 'query-1',
            warehouse_type: WarehouseTypes.POSTGRES,
            execution_source: 'warehouse',
            warehouse_execution_time_ms: 123,
            total_row_count: 42,
            columns_count: 5,
        });
    });

    it('projects a query.error event with null warehouse type', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        const event: QueryErrorEvent = {
            event: 'query.error',
            userId: 'user-1',
            properties: {
                queryId: 'query-1',
                organizationId: 'org-1',
                projectId: 'project-1',
                warehouseType: undefined,
                executionSource: 'warehouse',
            },
        };
        sink.handle(event);
        expect(writer.push).toHaveBeenCalledTimes(1);
        const [, row] = writer.push.mock.calls[0];
        expect(row).toMatchObject({
            event_name: 'query.error',
            org_id: 'org-1',
            project_id: 'project-1',
            query_id: 'query-1',
            warehouse_type: null,
            execution_source: 'warehouse',
        });
    });

    it('drops events without an organization id', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle({
            ...queryReadyEvent,
            properties: { ...queryReadyEvent.properties, organizationId: '' },
        });
        expect(writer.push).not.toHaveBeenCalled();
    });

    it('ignores events not in the registry', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle({
            event: 'space.created',
            userId: 'user-1',
            properties: { name: 'My space' },
        });
        expect(writer.push).not.toHaveBeenCalled();
    });

    it('never throws when the writer fails', () => {
        const writer = createWriterMock();
        writer.push.mockImplementation(() => {
            throw new Error('boom');
        });
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        expect(() => sink.handle(queryReadyEvent)).not.toThrow();
        expect(Logger.warn).toHaveBeenCalledTimes(1);
    });

    describe('LightdashAnalytics.track integration', () => {
        const createAnalytics = (writer: EventStreamWriter) =>
            new LightdashAnalytics({
                lightdashConfig: lightdashConfigMock, // rudder writeKey unset
                writeKey: 'notrack',
                dataPlaneUrl: 'notrack',
                options: { enable: false },
                eventStreamSink: new EventStreamSink(
                    eventStreamRegistry,
                    writer,
                ),
            });

        it('fires the sink even when Rudderstack tracking is disabled', () => {
            const writer = createWriterMock();
            const analytics = createAnalytics(writer);
            analytics.track(queryReadyEvent);
            expect(writer.push).toHaveBeenCalledTimes(1);
            expect(writer.push.mock.calls[0][0]).toBe('query_events');
        });

        it('does not throw into track() when projection fails', () => {
            const writer = createWriterMock();
            writer.push.mockImplementation(() => {
                throw new Error('boom');
            });
            const analytics = createAnalytics(writer);
            expect(() => analytics.track(queryReadyEvent)).not.toThrow();
            expect(Logger.warn).toHaveBeenCalledTimes(1);
        });
    });
});
