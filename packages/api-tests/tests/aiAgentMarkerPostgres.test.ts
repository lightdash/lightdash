import { SEED_PROJECT } from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { mcpText, openMcpSession, personalAccessTokens } from '../helpers/mcp';
import { pollUntil } from '../helpers/polling';

const projectUuid = SEED_PROJECT.project_uuid;
const sql =
    "SELECT current_setting('lightdash.agent', true) AS agent, current_setting('application_name') AS app";

describe('Postgres AI agent marker without a policy', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    afterAll(async () => {
        for (const { client, uuid } of personalAccessTokens) {
            await client.delete(
                `/api/v1/user/me/personal-access-tokens/${uuid}`,
            );
        }
    });

    it('marks MCP SQL sessions and leaves the normal SQL runner unmarked', async () => {
        const callTool = await openMcpSession(admin, projectUuid);
        const result = await callTool('run_sql', {
            projectUuid,
            sql,
            limit: 1,
        });
        if (result.isError) throw new Error(mcpText(result));
        expect(result.isError).toBeFalsy();
        expect(result).toMatchObject({
            structuredContent: {
                result: { rows: [{ agent: 'true', app: 'lightdash-ai' }] },
            },
        });

        const started = await admin.post<Body<{ queryUuid: string }>>(
            `/api/v2/projects/${projectUuid}/query/sql`,
            { sql, limit: 1 },
        );
        expect(started.status).toBe(200);
        const queryUrl = `/api/v2/projects/${projectUuid}/query/${started.body.results.queryUuid}`;
        const completed = await pollUntil<
            Body<{ status: string; error: string | null }>
        >(admin, queryUrl, {
            timeout: 60_000,
            condition: ({ results }) =>
                results.status === 'ready' || results.status === 'error',
        });
        expect(completed.results.status).toBe('ready');
        const response = await admin.get<string>(`${queryUrl}/results`);
        expect(response.status).toBe(200);
        let row: { agent: string | null; app: string };
        try {
            row = JSON.parse(response.body.trim());
        } catch {
            throw new Error('SQL runner returned invalid result JSON');
        }
        expect(row.agent).toBeNull();
        expect(row.app).not.toBe('lightdash-ai');
    });
});
