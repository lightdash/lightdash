import {
    BigqueryAuthenticationType,
    NotFoundError,
    WarehouseTypes,
    type AgentAccessReport,
    type CreateBigqueryCredentials,
} from '@lightdash/common';
import {
    AgentAccessProbeError,
    BigqueryAgentAccessProbe,
    BigqueryWarehouseClient,
} from '@lightdash/warehouses';
import { buildAccount } from '../../auth/account/account.mock';
import { testAgentAccess } from './testAgentAccess';

const connection = {
    type: WarehouseTypes.BIGQUERY,
    project: 'normal-project',
    dataset: 'dataset',
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
} as CreateBigqueryCredentials;
const table = (name: string) => ({
    database: 'normal-project',
    schema: 'dataset',
    name,
    location: 'EU',
});
const setup = () => {
    const principal = vi
        .spyOn(BigqueryAgentAccessProbe.prototype, 'principal')
        .mockResolvedValue('observed-agent@example.test');
    const list = vi
        .spyOn(BigqueryAgentAccessProbe.prototype, 'listTables')
        .mockResolvedValue([table('one'), table('two')]);
    const probe = vi
        .spyOn(BigqueryAgentAccessProbe.prototype, 'probe')
        .mockResolvedValue({ kind: 'readable', reason: null });
    const secrets = {
        type: WarehouseTypes.BIGQUERY,
        authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
        keyfileContents: {
            type: 'service_account',
            client_email: 'claimed@example.test',
            private_key: 'private-key',
        },
    } as const;
    const withWarehouseClient = vi.fn(async (_reference, _context, run) =>
        run({
            warehouseClient: Object.create(BigqueryWarehouseClient.prototype),
        }),
    );
    const deps = {
        analytics: { track: vi.fn() },
        aiServiceAccountCredentialsModel: {
            getSecrets: vi.fn().mockResolvedValue(secrets),
            getReplaceableSecrets: vi.fn().mockResolvedValue(secrets),
        },
        projectModel: {
            findExploreTableSummariesFromCache: vi.fn().mockResolvedValue({}),
        },
        warehouseClientFactory: { withWarehouseClient },
    };
    const input: Parameters<typeof testAgentAccess>[0] = {
        account: buildAccount(),
        projectUuid: 'project',
        organizationUuid: 'org',
        warehouseConnectionUuid: null,
        connection,
        request: {
            credentials: null,
            entryPoint: 'project_agent_identity_page',
        },
    };
    const run = () =>
        testAgentAccess(
            input,
            deps as unknown as Parameters<typeof testAgentAccess>[1],
        );
    return { principal, list, probe, deps, input, run, withWarehouseClient };
};
const assertCounts = (report: AgentAccessReport) => {
    expect(report.checkedCount).toBe(
        report.readableCount + report.blockedCount + report.errorCount,
    );
    if (report.totalCount !== null)
        expect(report.totalCount).toBe(
            report.checkedCount +
                report.notCheckedCount +
                report.truncatedCount,
        );
    else expect(report.tables).toEqual([]);
};

describe('testAgentAccess', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });
    it.each([0, 1, 2])(
        'reports %s readable tables without equating identity and table permission',
        async (readable) => {
            const f = setup();
            f.probe.mockImplementation(async (item) =>
                ['one', 'two'].indexOf(item.name) < readable
                    ? { kind: 'readable', reason: null }
                    : { kind: 'blocked', reason: 'access_denied' },
            );
            const report = await f.run();
            expect(report).toMatchObject({
                status: 'complete',
                principal: 'observed-agent@example.test',
                readableCount: readable,
                blockedCount: 2 - readable,
                totalCount: 2,
            });
            assertCounts(report);
            expect(
                f.withWarehouseClient.mock.calls.map(([ref]) => [
                    ref.kind,
                    ref.mode,
                    ref.agentSession,
                ]),
            ).toEqual([
                ['bypass', 'connection_test', true],
                ['bypass', 'connection_test', false],
            ]);
            expect(f.withWarehouseClient.mock.calls[1][0].credentials).toEqual(
                connection,
            );
        },
    );
    it('reports an empty inventory', async () => {
        const f = setup();
        f.list.mockResolvedValue([]);
        const report = await f.run();
        expect(report).toMatchObject({
            status: 'complete',
            totalCount: 0,
            readableCount: 0,
            tables: [],
        });
        expect(f.probe).not.toHaveBeenCalled();
        assertCounts(report);
    });
    it('returns an overall failure for an invalid key without table rows', async () => {
        const f = setup();
        f.deps.aiServiceAccountCredentialsModel.getSecrets.mockRejectedValue(
            new Error('secret-key'),
        );
        const report = await f.run();
        expect(report).toMatchObject({
            status: 'failed',
            failureReason: 'invalid_credentials',
            totalCount: null,
            tables: [],
        });
        expect(f.withWarehouseClient).not.toHaveBeenCalled();
        expect(JSON.stringify(report)).not.toContain('secret-key');
        assertCounts(report);
    });
    it('returns an overall failure for invalid submitted credentials', async () => {
        const f = setup();
        f.input.request.credentials = {
            type: WarehouseTypes.BIGQUERY,
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
            keyfileContents: {},
        };
        const report = await f.run();
        expect(report).toMatchObject({
            failureReason: 'invalid_credentials',
            credentialSource: 'submitted',
        });
        expect(f.withWarehouseClient).not.toHaveBeenCalled();
    });
    it('preserves the API error for a missing saved slot', async () => {
        const f = setup();
        f.deps.aiServiceAccountCredentialsModel.getSecrets.mockResolvedValue(
            null,
        );
        await expect(f.run()).rejects.toBeInstanceOf(NotFoundError);
        expect(f.withWarehouseClient).not.toHaveBeenCalled();
    });
    it.each([
        [
            new AgentAccessProbeError('job_permission_denied'),
            'job_permission_denied',
        ],
        [
            { code: 403, errors: [{ reason: 'accessDenied' }] },
            'warehouse_denied',
        ],
        [{ code: 401 }, 'invalid_credentials'],
        [{ code: 403, errors: [{ reason: 'quotaExceeded' }] }, 'quota'],
    ])(
        'reports a preflight failure with no fabricated blocked tables',
        async (error, reason) => {
            const f = setup();
            f.principal.mockRejectedValue(error);
            const report = await f.run();
            expect(report).toMatchObject({
                status: 'failed',
                failureReason: reason,
                tables: [],
                blockedCount: 0,
            });
            expect(f.list).not.toHaveBeenCalled();
            assertCounts(report);
        },
    );
    it('does not report a denominator when baseline listing fails', async () => {
        const f = setup();
        f.list.mockRejectedValue(new Error('raw secret error'));
        const report = await f.run();
        expect(report).toMatchObject({
            failureReason: 'baseline_failed',
            principal: 'observed-agent@example.test',
            totalCount: null,
            tables: [],
        });
        expect(f.probe).not.toHaveBeenCalled();
        assertCounts(report);
    });
    it('caps sorted unique tables globally at 200 and omits extra names', async () => {
        const f = setup();
        f.list.mockResolvedValue([
            ...Array.from({ length: 201 }, (_, i) =>
                table(String(200 - i).padStart(3, '0')),
            ),
            table('000'),
        ]);
        const report = await f.run();
        expect(report).toMatchObject({
            status: 'partial',
            totalCount: 201,
            truncatedCount: 1,
            checkedCount: 200,
        });
        expect(report.tables).toHaveLength(200);
        expect(report.tables[0].name).toBe('000');
        expect(report.tables[199].name).toBe('199');
        expect(f.probe).toHaveBeenCalledTimes(200);
        assertCounts(report);
    });
    it('keeps 200 fully checked tables complete', async () => {
        const f = setup();
        f.list.mockResolvedValue(
            Array.from({ length: 200 }, (_, i) => table(String(i))),
        );
        const report = await f.run();
        expect(report).toMatchObject({
            status: 'complete',
            totalCount: 200,
            truncatedCount: 0,
        });
        assertCounts(report);
    });
    it('marks selected unfinished rows not checked at the whole-run deadline', async () => {
        vi.useFakeTimers();
        const f = setup();
        f.list.mockResolvedValue(
            Array.from({ length: 100 }, (_, i) => table(String(i))),
        );
        let active = 0;
        let maximum = 0;
        f.probe.mockImplementation(async () => {
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise((resolve) => {
                setTimeout(resolve, 5000);
            });
            active -= 1;
            return { kind: 'error', reason: 'timeout' };
        });
        const run = f.run();
        await vi.advanceTimersByTimeAsync(60_000);
        const report = await run;
        expect(maximum).toBe(5);
        expect(report).toMatchObject({
            status: 'partial',
            errorCount: 55,
            notCheckedCount: 45,
            totalCount: 100,
        });
        assertCounts(report);
    });
    it('fails an inventory that exceeds the discovery budget', async () => {
        vi.useFakeTimers();
        const f = setup();
        f.list.mockImplementation(() => new Promise(() => {}));
        const run = f.run();
        await vi.advanceTimersByTimeAsync(15_000);
        const report = await run;
        expect(report).toMatchObject({
            failureReason: 'baseline_failed',
            totalCount: null,
            tables: [],
        });
    });
    it('invalidates completed rows if authentication fails mid-run', async () => {
        const f = setup();
        f.probe
            .mockResolvedValueOnce({ kind: 'readable', reason: null })
            .mockRejectedValueOnce(
                new AgentAccessProbeError('invalid_credentials'),
            );
        const report = await f.run();
        expect(report).toMatchObject({
            status: 'failed',
            failureReason: 'invalid_credentials',
            readableCount: 0,
            tables: [],
        });
        assertCounts(report);
    });
    it('adds valid joined-table datasets only for original connections', async () => {
        const f = setup();
        f.deps.projectModel.findExploreTableSummariesFromCache.mockResolvedValue(
            {
                valid: {
                    tables: {
                        joined: {
                            database: 'joined-project',
                            schema: 'joined',
                        },
                    },
                },
                broken: {
                    errors: true,
                    tables: {
                        bad: { database: 'excluded', schema: 'excluded' },
                    },
                },
            },
        );
        const report = await f.run();
        expect(report.datasets).toEqual([
            { database: 'normal-project', schema: 'dataset' },
            { database: 'joined-project', schema: 'joined' },
        ]);
        f.input.warehouseConnectionUuid = 'extra';
        f.list.mockClear();
        f.deps.projectModel.findExploreTableSummariesFromCache.mockClear();
        const extra = await f.run();
        expect(extra.datasets).toEqual([
            { database: 'normal-project', schema: 'dataset' },
        ]);
        expect(
            f.deps.projectModel.findExploreTableSummariesFromCache,
        ).not.toHaveBeenCalled();
    });
    it('tracks one names-free outcome, with counts and entry point', async () => {
        const f = setup();
        const report = await f.run();
        expect(f.deps.analytics.track).toHaveBeenCalledExactlyOnceWith({
            event: 'agent_identity.access_tested',
            userId: f.input.account.user.id,
            properties: {
                organizationId: 'org',
                projectId: 'project',
                userId: f.input.account.user.id,
                connectionUuid: null,
                warehouseType: WarehouseTypes.BIGQUERY,
                subjectKind: 'ai_service_account',
                credentialSource: 'saved',
                entryPoint: 'project_agent_identity_page',
                status: 'complete',
                failureReason: null,
                readableCount: 2,
                blockedCount: 0,
                errorCount: 0,
                checkedCount: 2,
                notCheckedCount: 0,
                totalCount: 2,
                truncatedCount: 0,
                datasetCount: 1,
                durationMs: expect.any(Number),
                capReached: false,
                deadlineReached: false,
            },
        });
        expect(JSON.stringify(f.deps.analytics.track.mock.calls)).not.toContain(
            report.principal,
        );
    });
});
