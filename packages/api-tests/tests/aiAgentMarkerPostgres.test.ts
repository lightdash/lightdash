import {
    AI_DIRECT_TRANSPORT,
    AiPrincipalKind,
    FeatureFlags,
    SEED_PROJECT,
    type AiAccessForUser,
    type AiAccessPolicy,
    type AiMarkerTestResult,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { mcpText, openMcpSession, personalAccessTokens } from '../helpers/mcp';
import { pollUntil } from '../helpers/polling';

const projectUuid = SEED_PROJECT.project_uuid;
const sql =
    "SELECT current_setting('lightdash.agent', true) AS agent, current_setting('application_name') AS app";

describe('Postgres marked person agent identity', () => {
    let admin: ApiClient;
    let originalPolicy: AiAccessPolicy | null = null;
    let clearFlag = false;
    let restorePolicy = false;
    const baseUrl = `/api/v2/projects/${projectUuid}/ai-access`;
    const flagUrl = `/api/v2/feature-flag/${FeatureFlags.AiPrincipals}`;

    beforeAll(async () => {
        admin = await login();
        const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
        if (!flag.body.results.enabled) {
            expect((await admin.post(flagUrl, { enabled: true })).status).toBe(
                200,
            );
            clearFlag = true;
        }
        originalPolicy = (
            await admin.get<Body<AiAccessPolicy | null>>(`${baseUrl}/policy`)
        ).body.results;
        if (originalPolicy) {
            expect(
                (
                    await admin.put(`${baseUrl}/policy`, {
                        enabled: true,
                        principalKind: AiPrincipalKind.PERSON,
                        transport: AI_DIRECT_TRANSPORT,
                    })
                ).status,
            ).toBe(200);
            restorePolicy = true;
        }
    });

    afterAll(async () => {
        if (restorePolicy && originalPolicy) {
            const { enabled, principalKind, transport } = originalPolicy;
            expect(
                (
                    await admin.put(`${baseUrl}/policy`, {
                        enabled,
                        principalKind,
                        transport,
                    })
                ).status,
            ).toBe(200);
        }
        if (clearFlag) expect((await admin.delete(flagUrl)).status).toBe(200);
        for (const { client, uuid } of personalAccessTokens) {
            await client.delete(
                `/api/v1/user/me/personal-access-tokens/${uuid}`,
            );
        }
    });

    it('defaults to marked person and verifies the actual session', async () => {
        const me = await admin.get<Body<AiAccessForUser>>(`${baseUrl}/me`);
        expect(me.status).toBe(200);
        expect(me.body.results).toMatchObject({
            identity: 'marked_person',
            enabled: true,
            principalKind: AiPrincipalKind.PERSON,
            refusal: null,
        });
        const tested = await admin.post<Body<AiMarkerTestResult>>(
            `${baseUrl}/marker/test`,
            {},
        );
        expect(tested.status).toBe(200);
        expect(tested.body.results).toMatchObject({
            ok: true,
            observed: { agent: 'true', application_name: 'lightdash-ai' },
        });
    });

    it('marks MCP SQL sessions and leaves the normal SQL runner unmarked', async () => {
        const startedAt = Date.now();
        const callTool = await openMcpSession(admin, projectUuid);
        const result = await callTool('run_sql', {
            projectUuid,
            sql: `${sql}, '${startedAt}' AS marker_test`,
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
