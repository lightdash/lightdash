import { SnowflakeAuthenticationType, WarehouseTypes } from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    startStub,
    type SnowflakeAiStub,
} from '../../../api-tests/stub/snowflake-ai-stub';
import {
    checkSnowflakeAgentSessionWithToken,
    SnowflakeWarehouseClient,
} from './SnowflakeWarehouseClient';

describe('Snowflake AI stub with the real SDK', () => {
    let stub: SnowflakeAiStub;
    beforeAll(async () => {
        stub = await startStub();
    });
    afterAll(async () => {
        await stub?.close();
    });

    it('runs literal SQL through a verified agent connection', async () => {
        const client = new SnowflakeWarehouseClient({
            type: WarehouseTypes.SNOWFLAKE,
            account: 'stub',
            user: 'stub',
            authenticationType: SnowflakeAuthenticationType.SSO,
            token: 'agent-token',
            accessUrl: stub.url,
            requireAgentSession: true,
            database: 'STUB',
            warehouse: 'STUB',
            schema: 'PUBLIC',
        });
        expect(
            (await client.runQuery("SELECT 'hello' AS greeting")).rows,
        ).toEqual([{ GREETING: 'hello' }]);
        expect((await client.runQuery("SELECT 'a' AS x, 1 AS n")).rows).toEqual(
            [{ X: 'a', N: 1 }],
        );
        expect((await client.runQuery('SELECT 1')).rows).toEqual([{ '1': 1 }]);
    });

    it('supports async query execution and result retrieval', async () => {
        const client = new SnowflakeWarehouseClient({
            type: WarehouseTypes.SNOWFLAKE,
            account: 'stub',
            user: 'stub',
            authenticationType: SnowflakeAuthenticationType.SSO,
            token: 'agent-token',
            accessUrl: stub.url,
            requireAgentSession: true,
            database: 'STUB',
            warehouse: 'STUB',
            schema: 'PUBLIC',
        });
        const rows: unknown[] = [];
        expect(
            await client.executeAsyncQuery(
                { sql: "SELECT 'hello' AS greeting LIMIT 1", tags: {} },
                (batch) => {
                    rows.push(...batch);
                },
            ),
        ).toMatchObject({ totalRows: 1 });
        expect(rows).toEqual([{ GREETING: 'hello' }]);
        expect(
            await client.executeAsyncQuery({ sql: 'SELECT 1', tags: {} }),
        ).toMatchObject({ totalRows: 1 });
    });

    it.each([
        ['agent-token', true],
        ['plain-token', false],
    ])('checks activation for %s', async (token, agentActivated) => {
        expect(
            await checkSnowflakeAgentSessionWithToken('stub', token, {
                accessUrl: stub.url,
            }),
        ).toEqual({
            agentActivated,
            currentRole: 'AGENT_ROLE',
            activeRestrictedSessionScopes: 'READ',
        });
    });

    it('throws for a revoked token when requested', async () => {
        await expect(
            checkSnowflakeAgentSessionWithToken('stub', 'revoked-token', {
                accessUrl: stub.url,
                throwOnError: true,
            }),
        ).rejects.toThrow(/invalid.*token/i);
    });

    it('refuses queries from a plain session', async () => {
        const client = new SnowflakeWarehouseClient({
            type: WarehouseTypes.SNOWFLAKE,
            account: 'stub',
            user: 'stub',
            authenticationType: SnowflakeAuthenticationType.SSO,
            token: 'plain-token',
            accessUrl: stub.url,
            requireAgentSession: true,
            database: 'STUB',
            warehouse: 'STUB',
            schema: 'PUBLIC',
        });
        await expect(client.runQuery('SELECT 1')).rejects.toThrow(
            'not an agent session',
        );
    });
});
