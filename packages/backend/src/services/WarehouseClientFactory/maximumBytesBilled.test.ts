import {
    ProjectMemberRole,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreatePostgresCredentials,
    type WarehouseClient,
} from '@lightdash/common';
import { describe, expect, test, vi } from 'vitest';
import {
    hasRoleMaximumBytesBilled,
    resolveMaximumBytesBilled,
    resolveMaximumBytesBilledForPerson,
    withMaximumBytesBilled,
} from './maximumBytesBilled';

const bigquery: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: 'project',
    dataset: 'dataset',
    timeoutSeconds: undefined,
    priority: undefined,
    keyfileContents: {},
    retries: undefined,
    location: undefined,
    maximumBytesBilled: 1000,
    maximumBytesBilledByRole: { [ProjectMemberRole.EDITOR]: 5000 },
    agentMaximumBytesBilled: 100,
};

const postgres: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    user: 'user',
    password: 'password',
    port: 5432,
    dbname: 'db',
    schema: 'public',
};

describe('resolveMaximumBytesBilled', () => {
    test('uses the agent override for agent queries', () => {
        expect(
            resolveMaximumBytesBilled(bigquery, {
                isAgent: true,
                role: ProjectMemberRole.EDITOR,
            }),
        ).toBe(100);
    });

    test('falls back to the role limit when no agent override is set', () => {
        expect(
            resolveMaximumBytesBilled(
                { ...bigquery, agentMaximumBytesBilled: undefined },
                { isAgent: true, role: ProjectMemberRole.EDITOR },
            ),
        ).toBe(5000);
    });

    test('uses the role limit for people', () => {
        expect(
            resolveMaximumBytesBilled(bigquery, {
                isAgent: false,
                role: ProjectMemberRole.EDITOR,
            }),
        ).toBe(5000);
    });

    test('returns null when the connection limit applies', () => {
        expect(
            resolveMaximumBytesBilled(bigquery, {
                isAgent: false,
                role: ProjectMemberRole.VIEWER,
            }),
        ).toBeNull();
        expect(
            resolveMaximumBytesBilled(bigquery, { isAgent: false, role: null }),
        ).toBeNull();
    });

    test('ignores values that are not limits', () => {
        const blank = {
            ...bigquery,
            agentMaximumBytesBilled: '' as unknown as number,
            maximumBytesBilledByRole: {
                [ProjectMemberRole.EDITOR]: '' as unknown as number,
            },
        };
        expect(
            resolveMaximumBytesBilled(blank, {
                isAgent: true,
                role: ProjectMemberRole.EDITOR,
            }),
        ).toBeNull();
        expect(hasRoleMaximumBytesBilled(blank)).toBe(false);
    });

    test('ignores other warehouses', () => {
        expect(
            resolveMaximumBytesBilled(postgres, {
                isAgent: true,
                role: ProjectMemberRole.EDITOR,
            }),
        ).toBeNull();
        expect(hasRoleMaximumBytesBilled(postgres)).toBe(false);
    });

    test('detects a configured role mapping', () => {
        expect(hasRoleMaximumBytesBilled(bigquery)).toBe(true);
        expect(
            hasRoleMaximumBytesBilled({
                ...bigquery,
                maximumBytesBilledByRole: {},
            }),
        ).toBe(false);
    });
});

describe('resolveMaximumBytesBilledForPerson', () => {
    test('looks up the role only when a role mapping is configured', async () => {
        const getRole = vi.fn().mockResolvedValue(ProjectMemberRole.EDITOR);
        expect(
            await resolveMaximumBytesBilledForPerson(bigquery, {
                isAgent: false,
                getRole,
            }),
        ).toBe(5000);
        expect(getRole).toHaveBeenCalledOnce();

        getRole.mockClear();
        expect(
            await resolveMaximumBytesBilledForPerson(
                { ...bigquery, maximumBytesBilledByRole: undefined },
                { isAgent: true, getRole },
            ),
        ).toBe(100);
        expect(getRole).not.toHaveBeenCalled();
    });

    test('uses no role without a person', async () => {
        expect(
            await resolveMaximumBytesBilledForPerson(bigquery, {
                isAgent: false,
                getRole: null,
            }),
        ).toBeNull();
    });
});

describe('withMaximumBytesBilled', () => {
    const buildClient = () => {
        const streamQuery = vi.fn(
            async (
                _sql: string,
                callback: Parameters<WarehouseClient['streamQuery']>[1],
                _options: Parameters<WarehouseClient['streamQuery']>[2],
            ) => {
                await callback({
                    fields: { a: {} as never },
                    rows: [{ a: 1 }],
                });
            },
        );
        const executeAsyncQuery = vi.fn().mockResolvedValue({ totalRows: 0 });
        const client = {
            streamQuery,
            executeAsyncQuery,
            runQuery: vi.fn(),
            credentials: bigquery,
        } as unknown as WarehouseClient;
        return { client, streamQuery, executeAsyncQuery };
    };

    test('returns the client unchanged without a limit', () => {
        const { client } = buildClient();
        expect(withMaximumBytesBilled(client, null)).toBe(client);
    });

    test('passes the limit to every query method', async () => {
        const { client, streamQuery, executeAsyncQuery } = buildClient();
        const limited = withMaximumBytesBilled(client, 42);
        const results = await limited.runQuery('SELECT 1', { a: 'b' });
        await limited.streamQuery('SELECT 2', vi.fn(), { tags: {} });
        await limited.executeAsyncQuery({ sql: 'SELECT 3', tags: {} });
        expect(results.rows).toEqual([{ a: 1 }]);
        expect(streamQuery.mock.calls[0][2]).toMatchObject({
            tags: { a: 'b' },
            maximumBytesBilled: 42,
        });
        expect(streamQuery.mock.calls[1][2]).toMatchObject({
            maximumBytesBilled: 42,
        });
        expect(executeAsyncQuery.mock.calls[0][0]).toMatchObject({
            maximumBytesBilled: 42,
        });
        expect(limited.credentials).toBe(bigquery);
    });
});
