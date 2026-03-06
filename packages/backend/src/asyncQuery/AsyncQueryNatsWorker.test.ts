import * as Sentry from '@sentry/node';
import * as nats from 'nats';
import type { JsMsg } from 'nats';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import Logger from '../logging/logger';
import type { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { AsyncQueryNatsWorker } from './AsyncQueryNatsWorker';

jest.mock('@sentry/node', () => ({
    continueTrace: jest.fn(async (_traceContext, fn) => fn()),
    getActiveSpan: jest.fn(() => undefined),
}));

jest.mock('nats', () => ({
    connect: jest.fn(),
    StringCodec: jest.fn(() => ({
        encode: (value: string) => Buffer.from(value, 'utf8'),
        decode: (value: Uint8Array) => Buffer.from(value).toString('utf8'),
    })),
}));

const validPayload = {
    organizationUuid: 'org-1',
    projectUuid: 'project-1',
    userUuid: 'user-1',
    queryUuid: 'query-1',
    query: 'SELECT 1',
    isRegisteredUser: true,
    queryTags: {
        query_context: 'explore',
    },
    fieldsMap: {},
    cacheKey: 'cache-key-1',
};

const createWorker = ({
    runAsyncWarehouseQuery = jest.fn(),
    workerConcurrency = 1,
}: {
    runAsyncWarehouseQuery?: jest.Mock;
    workerConcurrency?: number;
} = {}) =>
    new AsyncQueryNatsWorker({
        lightdashConfig: {
            ...lightdashConfigMock,
            asyncQuery: {
                nats: {
                    ...lightdashConfigMock.asyncQuery.nats,
                    enabled: true,
                    customerId: 'customer-a',
                    workerConcurrency,
                },
            },
        },
        asyncQueryService: {
            runAsyncWarehouseQuery,
        } as unknown as AsyncQueryService,
    });

const createMessage = (args: {
    subject: string;
    data: unknown;
    isJson?: boolean;
}) => {
    const messageData =
        args.isJson === false
            ? Buffer.from(String(args.data), 'utf8')
            : Buffer.from(JSON.stringify(args.data), 'utf8');
    return {
        subject: args.subject,
        data: messageData,
        headers: {
            get: jest.fn(() => undefined),
        },
        ack: jest.fn(),
        nak: jest.fn(),
        term: jest.fn(),
    };
};

describe('AsyncQueryNatsWorker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('ACKs valid warehouse messages after successful execution', async () => {
        const runAsyncWarehouseQuery = jest.fn();
        const worker = createWorker({ runAsyncWarehouseQuery });
        const message = createMessage({
            subject: 'tenant.customer-a.warehouse.query.jobs',
            data: {
                jobId: 'job-1',
                payload: validPayload,
            },
        });

        await worker.handleMessage(message as unknown as JsMsg);

        expect(runAsyncWarehouseQuery).toHaveBeenCalledWith(validPayload);
        expect(message.ack).toHaveBeenCalledTimes(1);
        expect(message.nak).not.toHaveBeenCalled();
        expect(message.term).not.toHaveBeenCalled();
        expect(Sentry.continueTrace).toHaveBeenCalled();
    });

    test('NAKs messages when handler fails', async () => {
        const worker = createWorker({
            runAsyncWarehouseQuery: jest.fn(async () => {
                throw new Error('warehouse execution failed');
            }),
        });
        const message = createMessage({
            subject: 'tenant.customer-a.warehouse.query.jobs',
            data: {
                jobId: 'job-1',
                payload: validPayload,
            },
        });

        await worker.handleMessage(message as unknown as JsMsg);

        expect(message.ack).not.toHaveBeenCalled();
        expect(message.nak).toHaveBeenCalledTimes(1);
        expect(message.term).not.toHaveBeenCalled();
    });

    test('TERMs malformed payloads', async () => {
        const worker = createWorker();
        const message = createMessage({
            subject: 'tenant.customer-a.warehouse.query.jobs',
            data: '{not-json',
            isJson: false,
        });

        await worker.handleMessage(message as unknown as JsMsg);

        expect(message.term).toHaveBeenCalledTimes(1);
        expect(message.ack).not.toHaveBeenCalled();
        expect(message.nak).not.toHaveBeenCalled();
    });

    test('spawns one consume loop per configured concurrency and TERMs unexpected tenant subjects', async () => {
        const loggerInfoSpy = jest.spyOn(Logger, 'info');
        const emptyMessages = {
            stop: jest.fn(),
            async *[Symbol.asyncIterator]() {
                // no-op
            },
        };
        const consume = jest.fn(async () => emptyMessages);
        const getConsumer = jest.fn(async () => ({
            consume,
        }));
        const drain = jest.fn(async () => undefined);
        (nats.connect as jest.Mock).mockResolvedValue({
            jetstream: () => ({
                consumers: {
                    get: getConsumer,
                },
            }),
            drain,
        });

        const worker = createWorker({ workerConcurrency: 3 });
        await worker.run();

        expect(getConsumer).toHaveBeenCalledWith(
            'WAREHOUSE_QUERY_JOBS',
            'worker-customer-a-warehouse',
        );
        expect(getConsumer).toHaveBeenCalledWith(
            'PRE_AGGREGATE_QUERY_JOBS',
            'worker-customer-a-pre-aggregate',
        );
        // 3 warehouse + 3 pre-aggregate = 6 consume loops
        expect(consume).toHaveBeenCalledTimes(6);
        expect(loggerInfoSpy).toHaveBeenCalledWith(
            'Async query worker warehouse-1 spawned (concurrency=3)',
        );
        expect(loggerInfoSpy).toHaveBeenCalledWith(
            'Async query worker warehouse-2 spawned (concurrency=3)',
        );
        expect(loggerInfoSpy).toHaveBeenCalledWith(
            'Async query worker warehouse-3 spawned (concurrency=3)',
        );
        expect(loggerInfoSpy).toHaveBeenCalledWith(
            'Async query worker pre-aggregate-1 spawned (concurrency=3)',
        );

        const message = createMessage({
            subject: 'tenant.customer-b.warehouse.query.jobs',
            data: {
                jobId: 'job-1',
                payload: validPayload,
            },
        });
        await worker.handleMessage(message as unknown as JsMsg);

        expect(message.term).toHaveBeenCalledTimes(1);
        expect(message.ack).not.toHaveBeenCalled();
        expect(message.nak).not.toHaveBeenCalled();

        await worker.stop();
        expect(drain).toHaveBeenCalled();
        loggerInfoSpy.mockRestore();
    });
});
