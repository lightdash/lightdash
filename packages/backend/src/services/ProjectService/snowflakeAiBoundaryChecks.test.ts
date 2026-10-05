import { describe, expect, it, vi } from 'vitest';
import {
    getSnowflakeAiBoundaryStatuses,
    runSnowflakeAiBoundaryChecks,
} from './snowflakeAiBoundaryChecks';

const makeClient = (
    responses: Array<{ rows?: Record<string, unknown>[]; error?: boolean }>,
) => {
    const runQuery = vi.fn(
        async (_sql: string, _tags: Record<string, string>) => {
            const response = responses.shift();
            if (response?.error) throw new Error('Blocked');
            return { rows: response?.rows ?? [] };
        },
    );
    return { runQuery };
};

describe('Snowflake AI boundary checks', () => {
    it('maps a protected session to passes without returning values', async () => {
        const client = makeClient([
            { rows: [{ AGENT_ACTIVE: true, ACTIVE_SCOPES: 'scope' }] },
            { rows: [{ TOTAL: 4, UNMASKED: 0, SECRET: 'hidden' }] },
            { error: true },
            { error: true },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: {
                database: 'DB',
                schema: 'PRIVATE',
                table: 'PEOPLE',
                column: 'SECRET',
            },
            warehouseQueryId: '01b-query',
        });
        expect(results.map(({ status }) => status)).toEqual([
            'pass',
            'pass',
            'pass',
            'pass',
        ]);
        expect(JSON.stringify(results)).not.toContain('hidden');
        expect(client.runQuery.mock.calls[1]?.[0]).toContain(
            'COUNT_IF("SECRET" IS NOT NULL',
        );
    });

    it('treats a null COUNT_IF result as no unmasked rows', async () => {
        const client = makeClient([
            { rows: [{ AGENT_ACTIVE: true, ACTIVE_SCOPES: 'scope' }] },
            { rows: [{ TOTAL: 2, UNMASKED: null }] },
            { error: true },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: {
                database: 'DB',
                schema: 'S',
                table: 'T',
                column: 'C',
            },
            warehouseQueryId: null,
        });
        expect(results[1]?.status).toBe('pass');
    });

    it('maps missing scope, unmasked data and allowed operations to failures', async () => {
        const client = makeClient([
            { rows: [{ AGENT_ACTIVE: true, ACTIVE_SCOPES: '' }] },
            { rows: [{ TOTAL: 4, UNMASKED: 1 }] },
            { rows: [{ 'COUNT(*)': 1 }] },
            { rows: [] },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: {
                database: 'DB',
                schema: 'PRIVATE',
                table: 'PEOPLE',
                column: 'SECRET',
            },
            warehouseQueryId: '01b-query',
        });
        expect(results.map(({ status }) => status)).toEqual([
            'fail',
            'fail',
            'fail',
            'fail',
        ]);
        expect(results[0]?.fixStep).toBe(4);
    });

    it('skips checks without a column or prior query', async () => {
        const client = makeClient([
            { rows: [{ AGENT_ACTIVE: false, ACTIVE_SCOPES: null }] },
            { error: true },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: null,
            warehouseQueryId: null,
        });
        expect(results.map(({ status }) => status)).toEqual([
            'fail',
            'skipped',
            'skipped',
            'pass',
        ]);
        expect(results[0]?.fixStep).toBe(2);
        expect(client.runQuery).toHaveBeenCalledTimes(2);
    });

    it('does not mistake a failed session for blocked access', async () => {
        const client = makeClient([{ error: true }]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: null,
            warehouseQueryId: '01b-query',
        });
        expect(results.map(({ status }) => status)).toEqual([
            'fail',
            'skipped',
            'skipped',
            'skipped',
        ]);
        expect(client.runQuery).toHaveBeenCalledTimes(1);
    });
});

describe('legacy earlier-results coverage', () => {
    it.each([true, false])(
        'reflects restrictions %s without probing earlier results as the same user',
        async (restrictionsEnabled) => {
            const client = makeClient([
                { rows: [{ AGENT_ACTIVE: true, ACTIVE_SCOPES: 'scope' }] },
                { error: true },
            ]);
            const checks = await runSnowflakeAiBoundaryChecks({
                client,
                protectedColumn: null,
                warehouseQueryId: 'old-query',
                aiIdentitiesEnabled: false,
                restrictionsEnabled,
            });
            expect(
                checks.find((check) => check.id === 'result_scan_blocked')
                    ?.status,
            ).toBe(restrictionsEnabled ? 'covered' : 'not_covered');
            expect(
                client.runQuery.mock.calls.some(([sql]) =>
                    sql.includes('RESULT_SCAN'),
                ),
            ).toBe(false);
        },
    );
});

describe('server guide evidence', () => {
    const base = {
        state: { marks: {}, lastTest: null },
        aiSignInEnabled: true,
        aiIdentitiesEnabled: true,
        memberCount: 3,
        readyIdentityCount: 2,
        signedInMemberCount: 3,
        restrictionsOn: true,
    };
    it('shows AI identities as not started while restrictions are off', () => {
        expect(
            getSnowflakeAiBoundaryStatuses({ ...base, restrictionsOn: false })
                .identities,
        ).toBe('not_started');
    });
    it('does not use legacy sign-ins as proof that AI identities are ready', () => {
        expect(getSnowflakeAiBoundaryStatuses(base).identities).toBe(
            'needs_attention',
        );
    });
    it('keeps manual confirmation distinct from verification', () => {
        expect(
            getSnowflakeAiBoundaryStatuses({
                ...base,
                state: {
                    marks: {
                        masking: {
                            userUuid: 'user',
                            name: 'Admin',
                            at: '2026-10-05',
                        },
                    },
                    lastTest: null,
                },
            }).masking,
        ).toBe('marked_done');
    });
    it('does not verify an empty test run', () => {
        expect(
            getSnowflakeAiBoundaryStatuses({
                ...base,
                state: {
                    marks: {},
                    lastTest: {
                        userUuid: 'user',
                        name: 'Admin',
                        at: '2026-10-05',
                        checks: [],
                        protectedColumn: null,
                        aiIdentitiesEnabled: true,
                    },
                },
            }).checks,
        ).toBe('not_started');
    });
    it('does not reuse a legacy test as evidence for AI identities', () => {
        expect(
            getSnowflakeAiBoundaryStatuses({
                ...base,
                state: {
                    marks: {},
                    lastTest: {
                        userUuid: 'user',
                        name: 'Admin',
                        at: '2026-10-05',
                        checks: [
                            {
                                id: 'masked_column',
                                status: 'pass',
                                detail: '',
                                fixStep: 3,
                            },
                        ],
                        protectedColumn: null,
                        aiIdentitiesEnabled: false,
                    },
                },
            }).masking,
        ).toBe('not_started');
    });
});

describe('check evidence precedence', () => {
    const checks = [
        { id: 'agent_active', status: 'pass', detail: '', fixStep: 4 },
        { id: 'masked_column', status: 'pass', detail: '', fixStep: 3 },
        {
            id: 'secondary_roles_blocked',
            status: 'pass',
            detail: '',
            fixStep: 4,
        },
        {
            id: 'result_scan_blocked',
            status: 'covered',
            detail: '',
            fixStep: 7,
        },
    ] satisfies import('@lightdash/common').SnowflakeAiBoundaryCheck[];
    const attribution = { userUuid: 'user', name: 'Admin', at: '2026-10-05' };
    const config = {
        state: {
            marks: { masking: attribution },
            lastTest: {
                ...attribution,
                checks,
                protectedColumn: null,
                aiIdentitiesEnabled: false,
            },
        },
        aiSignInEnabled: true,
        aiIdentitiesEnabled: false,
        memberCount: 1,
        readyIdentityCount: 0,
        signedInMemberCount: 1,
        restrictionsOn: true,
    };
    it('accepts legacy coverage as mitigation without a false failure', () => {
        expect(getSnowflakeAiBoundaryStatuses(config).checks).toBe('verified');
    });
    it('shows a failed check even when an admin marked the section as done', () => {
        const result = getSnowflakeAiBoundaryStatuses({
            ...config,
            state: {
                ...config.state,
                lastTest: {
                    ...config.state.lastTest,
                    checks: checks.map((check) =>
                        check.id === 'masked_column'
                            ? { ...check, status: 'fail' as const }
                            : check,
                    ),
                },
            },
        });
        expect(result.masking).toBe('needs_attention');
        expect(result.checks).toBe('needs_attention');
    });
});
