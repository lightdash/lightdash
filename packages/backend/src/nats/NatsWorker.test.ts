import type { JsMsg } from 'nats';
import type { NatsClient } from '../clients/NatsClient';
import Logger from '../logging/logger';
import type { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { NATS_CONTRACT } from './NatsContract';
import { NatsWorker } from './NatsWorker';

jest.mock('@sentry/node', () => ({
    captureException: jest.fn(),
    continueTrace: jest.fn((_context: unknown, callback: () => unknown) =>
        callback(),
    ),
    startSpan: jest.fn(
        (_options: unknown, callback: (span: unknown) => unknown) =>
            callback({}),
    ),
}));

const createMessage = ({
    subject,
    envelope,
}: {
    subject: string;
    envelope: unknown;
}): JsMsg =>
    ({
        subject,
        data: Buffer.from(JSON.stringify(envelope)),
        ack: jest.fn(),
        nak: jest.fn(),
        term: jest.fn(),
        working: jest.fn(),
    }) as unknown as JsMsg;

describe('NatsWorker', () => {
    beforeEach(() => {
        jest.spyOn(Logger, 'info').mockImplementation(() => Logger);
        jest.spyOn(Logger, 'error').mockImplementation(() => Logger);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('terms messages with invalid payloads before invoking the handler', async () => {
        const asyncQueryService = {
            runAsyncWarehouseQueryFromHistory: jest.fn(async () => true),
            runAsyncPreAggregateQueryFromHistory: jest.fn(async () => true),
        } as unknown as AsyncQueryService;

        const worker = new NatsWorker({
            natsClient: {
                isHealthy: jest.fn(async () => true),
            } as unknown as NatsClient,
            asyncQueryService,
            streams: ['warehouse'],
            workerConcurrency: 1,
        });

        const message = createMessage({
            subject: NATS_CONTRACT.warehouse.jobs.query.subject,
            envelope: {
                jobId: 'job-1',
                payload: {},
            },
        });

        await worker.handleMessage(message, 'worker-1');

        expect(
            asyncQueryService.runAsyncWarehouseQueryFromHistory,
        ).not.toHaveBeenCalled();
        expect(message.term).toHaveBeenCalledTimes(1);
        expect(message.ack).not.toHaveBeenCalled();
        expect(message.nak).not.toHaveBeenCalled();
    });

    test('captures telemetry fields declared in the contract', async () => {
        const asyncQueryService = {
            runAsyncWarehouseQueryFromHistory: jest.fn(async () => true),
            runAsyncPreAggregateQueryFromHistory: jest.fn(async () => true),
        } as unknown as AsyncQueryService;

        const worker = new NatsWorker({
            natsClient: {
                isHealthy: jest.fn(async () => true),
            } as unknown as NatsClient,
            asyncQueryService,
            streams: ['warehouse'],
            workerConcurrency: 1,
        });

        const message = createMessage({
            subject: NATS_CONTRACT.warehouse.jobs.query.subject,
            envelope: {
                jobId: 'job-2',
                payload: {
                    queryUuid: 'query-2',
                },
            },
        });

        await worker.handleMessage(message, 'worker-1');

        expect(
            asyncQueryService.runAsyncWarehouseQueryFromHistory,
        ).toHaveBeenCalledWith('query-2', 'worker-1');
        expect(Logger.info).toHaveBeenCalledWith(
            expect.stringContaining('started job job-2'),
            expect.objectContaining({
                jobId: 'job-2',
                subject: NATS_CONTRACT.warehouse.jobs.query.subject,
                queryUuid: 'query-2',
            }),
        );
        expect(message.ack).toHaveBeenCalledTimes(1);
    });
});
