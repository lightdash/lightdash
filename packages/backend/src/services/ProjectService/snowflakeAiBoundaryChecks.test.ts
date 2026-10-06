import { describe, expect, it, vi } from 'vitest';
import {
    getSnowflakeAiBoundaryStatuses,
    getUnavailableSnowflakeAiBoundaryChecks,
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

const session = {
    AGENT_ACTIVE: true,
    ACTIVE_SCOPES: 'scope',
    CURRENT_ROLE: 'ANALYST',
};

describe('Snowflake AI boundary checks', () => {
    it('runs the secondary roles probe last and does not return protected values', async () => {
        const client = makeClient([
            { rows: [session] },
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
            'pass',
        ]);
        expect(JSON.stringify(results)).not.toContain('hidden');
        expect(client.runQuery.mock.calls.map(([sql]) => sql)).toEqual([
            expect.stringContaining('CURRENT_ROLE()'),
            expect.stringContaining('COUNT_IF("SECRET" IS NOT NULL'),
            expect.stringContaining("RESULT_SCAN('01b-query')"),
            'USE SECONDARY ROLES ALL',
        ]);
        expect(results[3]?.detail).toContain('Raw SQL from AI stays off.');
        expect(results[3]?.detail).toContain(
            'a Restricted Session Scope does not block RESULT_SCAN',
        );
        expect(results[4]).toMatchObject({
            id: 'secondary_roles_blocked',
            status: 'pass',
            detail: 'Secondary roles are blocked. Snowflake said: Blocked',
        });
    });

    it('does not probe data when the agent scope is inactive', async () => {
        const client = makeClient([
            { rows: [{ ...session, ACTIVE_SCOPES: '' }] },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: null,
            warehouseQueryId: 'old-query',
        });
        expect(results.map(({ status }) => status)).toEqual([
            'fail',
            'pass',
            'skipped',
            'skipped',
            'skipped',
        ]);
        expect(results[4]?.id).toBe('secondary_roles_blocked');
        expect(client.runQuery).toHaveBeenCalledTimes(1);
        expect(results[3]?.detail).toContain('Raw SQL from AI stays off.');
    });

    it('skips the secondary roles probe when the agent session is inactive', async () => {
        const client = makeClient([
            { rows: [{ ...session, AGENT_ACTIVE: false }] },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: null,
            warehouseQueryId: 'old-query',
        });
        expect(results[4]).toMatchObject({
            id: 'secondary_roles_blocked',
            status: 'skipped',
        });
        expect(client.runQuery).toHaveBeenCalledTimes(1);
    });

    it('fails when an earlier result is readable', async () => {
        const client = makeClient([{ rows: [session] }, { rows: [] }]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: null,
            warehouseQueryId: 'old-query',
        });
        expect(results[3]?.status).toBe('fail');
        expect(results[3]?.detail).toContain('Raw SQL from AI stays off');
        expect(results[4]).toMatchObject({
            id: 'secondary_roles_blocked',
            status: 'fail',
            detail: 'The agent session can switch to secondary roles.',
        });
        expect(client.runQuery.mock.calls.at(-1)?.[0]).toBe(
            'USE SECONDARY ROLES ALL',
        );
    });

    it('does not mistake a failed session for blocked access', async () => {
        const client = makeClient([{ error: true }]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: null,
            warehouseQueryId: 'old-query',
        });
        expect(results.map(({ status }) => status)).toEqual([
            'fail',
            'skipped',
            'skipped',
            'skipped',
            'skipped',
        ]);
        expect(results[4]?.id).toBe('secondary_roles_blocked');
        expect(client.runQuery).toHaveBeenCalledTimes(1);
    });

    it('lists the secondary roles check when the session is unavailable', () => {
        expect(getUnavailableSnowflakeAiBoundaryChecks().at(-1)).toMatchObject({
            id: 'secondary_roles_blocked',
            status: 'skipped',
        });
    });
});

describe('server guide evidence', () => {
    const base = {
        state: { marks: {}, lastTest: null },
        aiSignInEnabled: true,
        memberCount: 3,
        signedInMemberCount: 2,
        restrictionsOn: true,
    };
    it('uses Snowflake sign-in counts', () => {
        expect(getSnowflakeAiBoundaryStatuses(base).sign_in).toBe(
            'needs_attention',
        );
        expect(
            getSnowflakeAiBoundaryStatuses({ ...base, signedInMemberCount: 3 })
                .sign_in,
        ).toBe('verified');
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
                    },
                },
            }).checks,
        ).toBe('not_started');
    });
    it('requires blocked secondary roles to verify session policy and all checks', async () => {
        const client = makeClient([
            { rows: [session] },
            { error: true },
            { error: true },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: null,
            warehouseQueryId: 'old-query',
        });
        const checks = results.map((check) =>
            check.id === 'masked_column'
                ? { ...check, status: 'pass' as const }
                : check,
        );
        const state = {
            marks: {},
            lastTest: {
                userUuid: 'user',
                name: 'Admin',
                at: '2026-10-05',
                checks,
                protectedColumn: null,
            },
        };
        expect(
            getSnowflakeAiBoundaryStatuses({ ...base, state }).session_policy,
        ).toBe('verified');
        expect(getSnowflakeAiBoundaryStatuses({ ...base, state }).checks).toBe(
            'verified',
        );

        const failedChecks = checks.map((check) =>
            check.id === 'secondary_roles_blocked'
                ? { ...check, status: 'fail' as const }
                : check,
        );
        const failedState = {
            ...state,
            lastTest: { ...state.lastTest, checks: failedChecks },
        };
        expect(
            getSnowflakeAiBoundaryStatuses({ ...base, state: failedState })
                .session_policy,
        ).toBe('needs_attention');
        expect(
            getSnowflakeAiBoundaryStatuses({ ...base, state: failedState })
                .checks,
        ).toBe('needs_attention');

        const missingState = {
            ...state,
            lastTest: { ...state.lastTest, checks: checks.slice(0, -1) },
        };
        expect(
            getSnowflakeAiBoundaryStatuses({ ...base, state: missingState })
                .session_policy,
        ).toBe('not_started');
        expect(
            getSnowflakeAiBoundaryStatuses({ ...base, state: missingState })
                .checks,
        ).toBe('not_started');
    });
});
