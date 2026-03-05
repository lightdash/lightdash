import { QueryExecutionContext } from '@lightdash/common';
import * as nats from 'nats';
import * as Sentry from '@sentry/node';
import type { RunAsyncWarehouseQueryJobPayload } from '../asyncQuery/natsContracts';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { AsyncQuerySchedulerClient } from './AsyncQuerySchedulerClient';

jest.mock('@sentry/node', () => ({
    startSpan: jest.fn(async (_spanOptions, fn) => fn({})),
    spanToTraceHeader: jest.fn(() => 'trace-header'),
    spanToBaggageHeader: jest.fn(() => 'baggage-header'),
    getActiveSpan: jest.fn(() => undefined),
}));

jest.mock('nats', () => ({
    connect: jest.fn(),
    headers: jest.fn(() => {
        const headerMap = new Map<string, string>();
        return {
            set: (key: string, value: string) => headerMap.set(key, value),
            get: (key: string) => headerMap.get(key),
        };
    }),
    StringCodec: jest.fn(() => ({
        encode: (value: string) => Buffer.from(value, 'utf8'),
        decode: (value: Uint8Array) => Buffer.from(value).toString('utf8'),
    })),
}));

const payload: RunAsyncWarehouseQueryJobPayload = {
    organizationUuid: 'org-1',
    projectUuid: 'project-1',
    userUuid: 'user-1',
    queryUuid: 'query-1',
    query: 'SELECT 1',
    isRegisteredUser: true,
    queryTags: {
        query_context: QueryExecutionContext.EXPLORE,
    },
    fieldsMap: {},
    cacheKey: 'cache-key-1',
};

describe('AsyncQuerySchedulerClient', () => {
    const publish = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (nats.connect as jest.Mock).mockResolvedValue({
            jetstream: () => ({
                publish,
            }),
        });
    });

    test('publishes warehouse jobs to the tenant subject', async () => {
        const client = new AsyncQuerySchedulerClient({
            lightdashConfig: {
                ...lightdashConfigMock,
                asyncQuery: {
                    nats: {
                        ...lightdashConfigMock.asyncQuery.nats,
                        enabled: true,
                        customerId: 'customer-a',
                    },
                },
            },
        });

        await client.enqueueWarehouseQuery(payload);

        expect(publish).toHaveBeenCalledWith(
            'tenant.customer-a.warehouse.query.jobs',
            expect.any(Buffer),
            expect.objectContaining({
                headers: expect.any(Object),
            }),
        );
    });

    test('includes trace metadata and payload in the published message body', async () => {
        const client = new AsyncQuerySchedulerClient({
            lightdashConfig: {
                ...lightdashConfigMock,
                asyncQuery: {
                    nats: {
                        ...lightdashConfigMock.asyncQuery.nats,
                        enabled: true,
                        customerId: 'customer-a',
                    },
                },
            },
        });

        const { jobId } = await client.enqueueWarehouseQuery(payload);

        const publishData = publish.mock.calls[0][1] as Buffer;
        const decoded = JSON.parse(publishData.toString('utf8'));

        expect(decoded.jobId).toEqual(jobId);
        expect(decoded.traceHeader).toEqual('trace-header');
        expect(decoded.baggageHeader).toEqual('baggage-header');
        expect(decoded.sentryMessageId).toEqual(jobId);
        expect(decoded.payload).toEqual(payload);
        expect(Sentry.startSpan).toHaveBeenCalled();
    });

    test('bubbles publish failures', async () => {
        publish.mockRejectedValueOnce(new Error('publish failed'));

        const client = new AsyncQuerySchedulerClient({
            lightdashConfig: {
                ...lightdashConfigMock,
                asyncQuery: {
                    nats: {
                        ...lightdashConfigMock.asyncQuery.nats,
                        enabled: true,
                        customerId: 'customer-a',
                    },
                },
            },
        });

        await expect(client.enqueueWarehouseQuery(payload)).rejects.toThrow(
            'publish failed',
        );
    });
});
