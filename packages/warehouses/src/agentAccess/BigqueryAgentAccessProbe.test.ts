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
    const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json({}));
    vi.stubGlobal('fetch', request);
    const getAccessToken = vi.fn().mockResolvedValue('test-access-token');
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
        authClient: { getAccessToken },
        baseUrl: 'https://custom.example/bigquery/v2',
    } as unknown as BigqueryWarehouseClient['client'];
    return {
        request,
        getAccessToken,
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
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });
    it('only submits a labelled dry run in the execution project and dataset location', async () => {
        const f = setup();
        await expect(
            f.probe.probe(table, Date.now() + 60_000),
        ).resolves.toEqual({ kind: 'readable', reason: null });
        expect(f.request).toHaveBeenCalledExactlyOnceWith(
            'https://custom.example/bigquery/v2/projects/billing-project/jobs',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    Authorization: 'Bearer test-access-token',
                    'Content-Type': 'application/json',
                },
                signal: expect.any(AbortSignal),
                body: JSON.stringify({
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
                }),
            }),
        );
        expect(f.getAccessToken).toHaveBeenCalledOnce();
    });
    it('escapes backslashes and backticks in discovered identifiers', async () => {
        const f = setup();
        await f.probe.probe({ ...table, name: 'a`b\\c' }, Date.now() + 60_000);
        expect(f.request.mock.calls[0][1]?.body).toContain(
            JSON.stringify('SELECT * FROM `data-project.dataset.a\\`b\\\\c`'),
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
        f.request.mockResolvedValue(
            Response.json(
                { error: { code, errors: [{ reason }] } },
                { status: code },
            ),
        );
        await expect(
            f.probe.probe(table, Date.now() + 60_000),
        ).resolves.toEqual(expected);
    });
    it('invalidates a run when job permission is lost', async () => {
        const f = setup();
        f.request.mockResolvedValue(
            Response.json(
                {
                    error: {
                        code: 403,
                        errors: [
                            {
                                reason: 'accessDenied',
                                message:
                                    'Missing bigquery.jobs.create permission',
                            },
                        ],
                    },
                },
                { status: 403 },
            ),
        );
        await expect(
            f.probe.probe(table, Date.now() + 60_000),
        ).rejects.toMatchObject({ reason: 'job_permission_denied' });
    });
    it('invalidates a run when authentication fails', async () => {
        const f = setup();
        f.request.mockResolvedValue(
            Response.json({ error: { code: 401 } }, { status: 401 }),
        );
        await expect(
            f.probe.probe(table, Date.now() + 60_000),
        ).rejects.toMatchObject({ reason: 'invalid_credentials' });
    });
    it('aborts the transport at five seconds, without retries', async () => {
        vi.useFakeTimers();
        const f = setup();
        f.request.mockImplementation(
            (_url, options) =>
                new Promise((_resolve, reject) => {
                    options?.signal?.addEventListener(
                        'abort',
                        () => reject(options.signal?.reason),
                        { once: true },
                    );
                }),
        );
        const result = f.probe.probe(table, Date.now() + 60_000);
        await vi.advanceTimersByTimeAsync(5000);
        await expect(result).resolves.toEqual({
            kind: 'error',
            reason: 'timeout',
        });
        expect(f.request.mock.calls[0][1]?.signal?.aborted).toBe(true);
        expect(f.request).toHaveBeenCalledOnce();
    });
    it.each([5000, 250])(
        'bounds a stalled token to %s ms and never sends a warehouse request',
        async (budget) => {
            vi.useFakeTimers();
            const f = setup();
            const token = Promise.withResolvers<string>();
            f.getAccessToken.mockReturnValue(token.promise);
            const deadline = Date.now() + (budget === 5000 ? 60_000 : budget);
            await Promise.all([
                expect(f.probe.principal(deadline)).rejects.toMatchObject({
                    reason: 'timeout',
                }),
                vi.advanceTimersByTimeAsync(budget),
            ]);
            token.resolve('late-token');
            await vi.advanceTimersByTimeAsync(0);
            await expect(
                f.probe.probe(table, Date.now() + 60_000),
            ).resolves.toEqual({
                kind: 'error',
                reason: 'timeout',
            });
            expect(f.getAccessToken).toHaveBeenCalledOnce();
            expect(f.request).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
        },
    );
    it('shares one pending token across concurrent probes and later requests', async () => {
        const f = setup();
        const token = Promise.withResolvers<string>();
        f.getAccessToken.mockReturnValue(token.promise);
        const deadline = Date.now() + 60_000;
        const results = [
            f.probe.probe(table, deadline),
            f.probe.probe(table, deadline),
        ];
        expect(f.getAccessToken).toHaveBeenCalledOnce();
        expect(f.request).not.toHaveBeenCalled();
        token.resolve('shared-token');
        await expect(Promise.all(results)).resolves.toEqual([
            { kind: 'readable', reason: null },
            { kind: 'readable', reason: null },
        ]);
        await f.probe.probe(table, deadline);
        expect(f.getAccessToken).toHaveBeenCalledOnce();
        expect(f.request).toHaveBeenCalledTimes(3);
        for (const [, options] of f.request.mock.calls) {
            expect(options?.headers).toMatchObject({
                Authorization: 'Bearer shared-token',
            });
        }
    });
    it('uses the remaining request budget after token acquisition', async () => {
        vi.useFakeTimers();
        const f = setup();
        const token = Promise.withResolvers<string>();
        f.getAccessToken.mockReturnValue(token.promise);
        f.request.mockImplementation(() => new Promise(() => {}));
        const result = f.probe.probe(table, Date.now() + 4000);
        await vi.advanceTimersByTimeAsync(3000);
        token.resolve('test-token');
        await vi.advanceTimersByTimeAsync(999);
        expect(f.request.mock.calls[0][1]?.signal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await expect(result).resolves.toEqual({
            kind: 'error',
            reason: 'timeout',
        });
        expect(f.request.mock.calls[0][1]?.signal?.aborted).toBe(true);
        expect(f.request).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('rejects missing access tokens without sending a warehouse request', async () => {
        const f = setup();
        f.getAccessToken.mockResolvedValue(null);
        await expect(
            f.probe.principal(Date.now() + 60_000),
        ).rejects.toMatchObject({
            reason: 'invalid_credentials',
        });
        expect(f.request).not.toHaveBeenCalled();
    });
    it('does not start authentication after the deadline', async () => {
        const f = setup();
        await expect(f.probe.probe(table, Date.now() - 1)).resolves.toEqual({
            kind: 'error',
            reason: 'timeout',
        });
        expect(f.getAccessToken).not.toHaveBeenCalled();
        expect(f.request).not.toHaveBeenCalled();
    });
    it('observes the principal instead of reading it from the key', async () => {
        const f = setup();
        f.request.mockResolvedValue(
            Response.json({
                jobComplete: true,
                rows: [{ f: [{ v: 'observed@example.test' }] }],
            }),
        );
        await expect(f.probe.principal(Date.now() + 60_000)).resolves.toBe(
            'observed@example.test',
        );
        expect(f.request.mock.calls[0][1]?.body).toContain(
            'SELECT SESSION_USER() AS principal',
        );
    });
    it('fails identity verification when no principal is returned', async () => {
        const f = setup();
        f.request.mockResolvedValue(
            Response.json({ jobComplete: true, rows: [] }),
        );
        await expect(
            f.probe.principal(Date.now() + 60_000),
        ).rejects.toBeInstanceOf(AgentAccessProbeError);
    });
    it('lists every metadata page and preserves dataset location', async () => {
        const f = setup();
        f.request
            .mockResolvedValueOnce(
                Response.json({ location: 'asia-northeast1' }),
            )
            .mockResolvedValueOnce(
                Response.json({
                    tables: [{ tableReference: { tableId: 'one' } }],
                    nextPageToken: 'next token',
                }),
            )
            .mockResolvedValueOnce(
                Response.json({
                    tables: [{ tableReference: { tableId: 'two' } }],
                }),
            );
        await expect(
            f.probe.listTables(table, Date.now() + 15_000),
        ).resolves.toEqual(
            ['one', 'two'].map((name) => ({
                ...table,
                name,
                location: 'asia-northeast1',
            })),
        );
        expect(f.request.mock.calls[2][0]).toContain('pageToken=next+token');
        expect(
            f.request.mock.calls.every(
                ([, options]) => options?.method === 'GET',
            ),
        ).toBe(true);
    });
    it('classifies local auth failures only during identity verification', () => {
        const error = Object.assign(
            new Error('error:1E08010C:DECODER routines::unsupported'),
            {
                code: 'ERR_OSSL_UNSUPPORTED',
            },
        );
        expect(classifyBigqueryAccessError(error, 'identity')).toEqual({
            kind: 'fatal',
            reason: 'invalid_credentials',
        });
        expect(classifyBigqueryAccessError(error)).toEqual({
            kind: 'error',
            reason: 'unknown',
        });
    });
    it.each([
        [
            { response: { status: 400, data: { error: 'invalid_grant' } } },
            'invalid_credentials',
        ],
        [{ response: { status: 400, data: {} } }, 'unknown'],
        [{ code: 400 }, 'unknown'],
        [{ errors: [{ reason: 'unexpected' }] }, 'unknown'],
        [new AgentAccessProbeError('unknown'), 'unknown'],
        [{ code: 'ECONNRESET' }, 'unavailable'],
        [{ code: 'ENOTFOUND' }, 'unavailable'],
        [{ code: 'ETIMEDOUT' }, 'timeout'],
        [{ name: 'TimeoutError' }, 'timeout'],
        [new AgentAccessProbeError('timeout'), 'timeout'],
    ])(
        'preserves HTTP, explicit probe and network errors during identity',
        (error, reason) => {
            expect(classifyBigqueryAccessError(error, 'identity').reason).toBe(
                reason,
            );
        },
    );
    it('does not interpret an unclassified 403 as blocked table access', () => {
        expect(classifyBigqueryAccessError({ code: 403 })).toEqual({
            kind: 'fatal',
            reason: 'warehouse_denied',
        });
    });
});
