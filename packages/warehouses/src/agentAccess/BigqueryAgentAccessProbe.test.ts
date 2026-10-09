import {
    BigqueryAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
} from '@lightdash/common';
import { BigqueryWarehouseClient } from '../warehouseClients/BigqueryWarehouseClient';
import {
    AgentAccessProbeError,
    BigqueryAgentAccessProbe,
    classifyBigqueryAccessError,
} from './BigqueryAgentAccessProbe';

const setup = () => {
    const request = vi.fn().mockResolvedValue({ data: {} });
    const warehouse = Object.create(
        BigqueryWarehouseClient.prototype,
    ) as BigqueryWarehouseClient;
    warehouse.credentials = {
        type: WarehouseTypes.BIGQUERY,
        project: 'data-project',
        executionProject: 'billing-project',
        dataset: 'dataset',
        authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    } as CreateBigqueryCredentials;
    warehouse.client = {
        authClient: { request },
        baseUrl: 'https://custom.example/bigquery/v2',
        getQueryResults: vi.fn(),
    } as unknown as BigqueryWarehouseClient['client'];
    return {
        request,
        warehouse,
        probe: new BigqueryAgentAccessProbe(warehouse),
    };
};
const table = {
    database: 'data-project',
    schema: 'dataset',
    name: 'table',
    location: 'EU',
};

describe('BigqueryAgentAccessProbe', () => {
    afterEach(() => vi.useRealTimers());
    it('only submits a labelled dry run in the execution project and dataset location', async () => {
        const f = setup();
        await expect(
            f.probe.probe(table, Date.now() + 60_000),
        ).resolves.toEqual({ kind: 'readable', reason: null });
        expect(f.request).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                url: 'https://custom.example/bigquery/v2/projects/billing-project/jobs',
                method: 'POST',
                timeout: 5000,
                retry: false,
                signal: expect.any(AbortSignal),
                data: {
                    jobReference: {
                        projectId: 'billing-project',
                        location: 'EU',
                    },
                    configuration: {
                        dryRun: true,
                        labels: { agent: 'true' },
                        jobTimeoutMs: '5000',
                        query: {
                            query: 'SELECT * FROM `data-project.dataset.table`',
                            useLegacySql: false,
                            useQueryCache: false,
                        },
                    },
                },
            }),
        );
        expect(Object.keys(f.warehouse.client)).toContain('getQueryResults');
        expect(
            f.request.mock.calls.every(([options]) =>
                options.url.endsWith('/jobs'),
            ),
        ).toBe(true);
    });
    it('escapes backslashes and backticks in discovered identifiers', async () => {
        const f = setup();
        await f.probe.probe({ ...table, name: 'a`b\\c' }, Date.now() + 60_000);
        expect(f.request.mock.calls[0][0].data.configuration.query.query).toBe(
            'SELECT * FROM `data-project.dataset.a\\`b\\\\c`',
        );
    });
    it.each([
        [403, 'accessDenied', { kind: 'blocked', reason: 'access_denied' }],
        [403, 'quotaExceeded', { kind: 'error', reason: 'quota' }],
        [403, 'rateLimitExceeded', { kind: 'error', reason: 'quota' }],
        [404, 'notFound', { kind: 'error', reason: 'not_found' }],
        [429, '', { kind: 'error', reason: 'quota' }],
        [500, 'backendError', { kind: 'error', reason: 'unavailable' }],
        [400, 'invalidQuery', { kind: 'error', reason: 'unsupported' }],
        [400, 'unexpected', { kind: 'error', reason: 'unknown' }],
    ])('classifies %s / %s', async (code, reason, expected) => {
        const f = setup();
        f.request.mockRejectedValue({
            response: {
                status: code,
                data: { error: { code, errors: [{ reason }] } },
            },
        });
        await expect(
            f.probe.probe(table, Date.now() + 60_000),
        ).resolves.toEqual(expected);
    });
    it('invalidates a run when job permission is lost', async () => {
        const f = setup();
        f.request.mockRejectedValue({
            code: 403,
            errors: [
                {
                    reason: 'accessDenied',
                    message: 'Missing bigquery.jobs.create permission',
                },
            ],
        });
        await expect(
            f.probe.probe(table, Date.now() + 60_000),
        ).rejects.toMatchObject({ reason: 'job_permission_denied' });
    });
    it('invalidates a run when authentication fails', async () => {
        const f = setup();
        f.request.mockRejectedValue({ code: 401 });
        await expect(
            f.probe.probe(table, Date.now() + 60_000),
        ).rejects.toMatchObject({ reason: 'invalid_credentials' });
    });
    it('aborts the transport at five seconds, without retries', async () => {
        vi.useFakeTimers();
        const f = setup();
        f.request.mockImplementation(() => new Promise(() => {}));
        const result = f.probe.probe(table, Date.now() + 60_000);
        await vi.advanceTimersByTimeAsync(5000);
        await expect(result).resolves.toEqual({
            kind: 'error',
            reason: 'timeout',
        });
        expect(f.request.mock.calls[0][0].signal.aborted).toBe(true);
        expect(f.request).toHaveBeenCalledOnce();
    });
    it('observes the principal instead of reading it from the key', async () => {
        const f = setup();
        f.request.mockResolvedValue({
            data: {
                jobComplete: true,
                rows: [{ f: [{ v: 'observed@example.test' }] }],
            },
        });
        await expect(f.probe.principal(Date.now() + 60_000)).resolves.toBe(
            'observed@example.test',
        );
        expect(f.request.mock.calls[0][0].data.query).toBe(
            'SELECT SESSION_USER() AS principal',
        );
    });
    it('fails identity verification when no principal is returned', async () => {
        const f = setup();
        f.request.mockResolvedValue({ data: { jobComplete: true, rows: [] } });
        await expect(
            f.probe.principal(Date.now() + 60_000),
        ).rejects.toBeInstanceOf(AgentAccessProbeError);
    });
    it('lists every metadata page and preserves dataset location', async () => {
        const f = setup();
        f.request
            .mockResolvedValueOnce({ data: { location: 'asia-northeast1' } })
            .mockResolvedValueOnce({
                data: {
                    tables: [{ tableReference: { tableId: 'one' } }],
                    nextPageToken: 'next token',
                },
            })
            .mockResolvedValueOnce({
                data: { tables: [{ tableReference: { tableId: 'two' } }] },
            });
        await expect(
            f.probe.listTables(table, Date.now() + 15_000),
        ).resolves.toEqual(
            ['one', 'two'].map((name) => ({
                ...table,
                name,
                location: 'asia-northeast1',
            })),
        );
        expect(f.request.mock.calls[2][0].url).toContain(
            'pageToken=next+token',
        );
        expect(
            f.request.mock.calls.every(([options]) => options.method === 'GET'),
        ).toBe(true);
    });
    it('does not interpret an unclassified 403 as blocked table access', () => {
        expect(classifyBigqueryAccessError({ code: 403 })).toEqual({
            kind: 'fatal',
            reason: 'warehouse_denied',
        });
    });
});
