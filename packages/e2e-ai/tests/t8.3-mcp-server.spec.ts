import { SEED_ORG_1, SEED_ORG_1_ADMIN } from '@lightdash/common';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import { single } from '../lib/assert';
import { markUndone, recordUndo, type Undo } from '../lib/cleanupLedger';
import { queryRows } from '../lib/db';
import { runId } from '../lib/env';
import { baseTableOf, fieldId, getExplore } from '../lib/explores';
import { expect, test } from '../lib/fixtures';
import { createMcpClient, probeMcp } from '../lib/mcp';
import { reportObservation, reportWarning } from '../lib/report';
import { ROUTER_FALLBACK_REASONING, withRouterEnabled } from '../lib/router';

// Plan T8.3. Runs whenever MCP_ENABLED=true. V only on which agent is routed
// to, which is reported. route_agent needs the org AI router (enabled for the
// test and restored) and sets the caller's MCP agent context, which is put
// back afterwards.

const REVENUE_PROMPT = 'What is total revenue by payment method?';
// The stable/default tool surface the release checks pin.
const SNAPSHOT = path.join(
    __dirname,
    '../../common/src/schemas/json/mcp-tools-1.0.json',
);

const snapshotToolNames = () => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    } catch (error) {
        throw new Error(
            `Cannot read the MCP tool snapshot ${SNAPSHOT}: ${String(error)}`,
        );
    }
    return z
        .object({ tools: z.array(z.object({ name: z.string() })) })
        .parse(parsed)
        .tools.map((tool) => tool.name);
};

const routeResultSchema = z.object({
    agentUuid: z.string(),
    agentName: z.string(),
    reasoning: z.string(),
    candidates: z.array(z.object({ agentUuid: z.string(), name: z.string() })),
});

const metricResultSchema = z.object({
    result: z.looseObject({
        status: z.string(),
        queryUuid: z.string(),
        rows: z.array(z.record(z.string(), z.unknown())).optional(),
    }),
});

/** Runs `fn`, then puts the caller's MCP agent context back as it was. */
const withMcpContextRestored = async (db: Pool, fn: () => Promise<void>) => {
    const key = [SEED_ORG_1_ADMIN.user_uuid, SEED_ORG_1.organization_uuid];
    const [previous] = await queryRows(
        db,
        'SELECT context FROM mcp_context WHERE user_uuid = $1 AND organization_uuid = $2',
        key,
        z.object({ context: z.unknown() }),
    );
    const restore: Undo =
        previous === undefined
            ? {
                  kind: 'sql',
                  text: 'DELETE FROM mcp_context WHERE user_uuid = $1 AND organization_uuid = $2',
                  params: key,
              }
            : {
                  kind: 'sql',
                  text: 'UPDATE mcp_context SET context = $3::jsonb WHERE user_uuid = $1 AND organization_uuid = $2',
                  params: [...key, JSON.stringify(previous.context)],
              };
    const undo = recordUndo(restore);
    try {
        await fn();
    } finally {
        await db.query(restore.text, restore.params);
        markUndone(undo);
    }
};

test('T8.3 Lightdash MCP server: route_agent and run_metric_query', async ({
    api,
    db,
    f4Agents,
}) => {
    const probe = await probeMcp();
    test.skip(probe === 404, 'MCP is off: the backend needs MCP_ENABLED=true');
    expect(probe, 'unauthenticated MCP request').toBe(401);

    const client = createMcpClient(projectUuid, `e2e-ai-${runId}`);
    await client.initialize();
    const sessionId = client.sessionId();
    expect(sessionId, 'mcp-session-id from initialize').not.toBeNull();

    const listed = (await client.listTools()).map((tool) => tool.name);
    const snapshot = snapshotToolNames();
    expect(
        listed.filter((name) => !snapshot.includes(name)),
        'tools outside the committed snapshot',
    ).toEqual([]);
    expect(listed, 'tools this test calls').toEqual(
        expect.arrayContaining(['route_agent', 'run_metric_query']),
    );
    const missing = snapshot.filter((name) => !listed.includes(name));
    reportObservation(
        `${listed.length} of ${snapshot.length} snapshot tools listed${missing.length > 0 ? `; not registered for this caller: ${missing.join(', ')}` : ''}`,
    );

    await withRouterEnabled(api, db, () =>
        withMcpContextRestored(db, async () => {
            const routed = await client.callTool('route_agent', {
                prompt: REVENUE_PROMPT,
                projectUuid,
            });
            expect(
                routed.isError ?? false,
                `route_agent: ${JSON.stringify(routed.content)}`,
            ).toBe(false);
            const route = routeResultSchema.parse(routed.structuredContent);
            expect(
                route.candidates.map((candidate) => candidate.agentUuid),
                'candidates include the F4 pair',
            ).toEqual(
                expect.arrayContaining([
                    f4Agents.revenue.uuid,
                    f4Agents.customers.uuid,
                ]),
            );
            expect(
                route.candidates.map((candidate) => candidate.agentUuid),
                'routed agent is a candidate',
            ).toContain(route.agentUuid);
            reportObservation(`route_agent picked ${route.agentName}`);
            if (route.reasoning.includes(ROUTER_FALLBACK_REASONING)) {
                reportWarning(
                    'route_agent: the selector named an agent that is not a candidate, so the router fell back to the first candidate',
                );
            }
        }),
    );

    const orders = await getExplore(api, 'orders');
    const metric = Object.values(baseTableOf(orders).metrics)[0];
    const status = Object.values(baseTableOf(orders).dimensions).find(
        (dimension) => dimension.name === 'status',
    );
    if (metric === undefined || status === undefined) {
        throw new Error(
            'The orders explore has no metric or no status dimension',
        );
    }
    const queried = await client.callTool('run_metric_query', {
        title: `e2e-ai ${runId}`,
        description: 'Orders by status',
        projectUuid,
        queryConfig: {
            exploreName: 'orders',
            dimensions: [fieldId(status)],
            metrics: [fieldId(metric)],
            sorts: [],
            limit: null,
        },
    });
    expect(
        queried.isError ?? false,
        `run_metric_query: ${JSON.stringify(queried.content)}`,
    ).toBe(false);
    const { result } = metricResultSchema.parse(queried.structuredContent);
    expect(result.status, 'run_metric_query status').toBe('done');
    expect(result.rows?.length ?? 0, 'rows').toBeGreaterThan(0);
    const history = single(
        await queryRows(
            db,
            'SELECT context, status FROM query_history WHERE query_uuid = $1',
            [result.queryUuid],
            z.object({ context: z.string(), status: z.string() }),
        ),
        `query_history ${result.queryUuid}`,
    );
    expect(history).toEqual({
        context: 'mcp.run_metric_query',
        status: 'ready',
    });

    // McpService.recordToolCall is fire-and-forget: a row lands after the
    // response that it records, so the rows are polled.
    const readCalls = () =>
        queryRows(
            db,
            `SELECT tool_name, status, auth_type, client_name FROM mcp_tool_call
             WHERE mcp_session_id = $1 AND tool_name = ANY($2)
             ORDER BY created_at`,
            [sessionId, ['route_agent', 'run_metric_query']],
            z.object({
                tool_name: z.string(),
                status: z.string(),
                auth_type: z.string().nullable(),
                client_name: z.string().nullable(),
            }),
        );
    await expect
        .poll(
            async () =>
                (await readCalls()).map(({ tool_name, status: callStatus }) => [
                    tool_name,
                    callStatus,
                ]),
            { message: 'mcp_tool_call rows' },
        )
        .toEqual([
            ['route_agent', 'success'],
            ['run_metric_query', 'success'],
        ]);
    const calls = await readCalls();
    calls.forEach((call) =>
        expect(call.auth_type, `${call.tool_name} auth_type`).not.toBeNull(),
    );
    reportObservation(
        `auth_type ${calls[0]?.auth_type}, client_name ${calls[0]?.client_name ?? 'none'}`,
    );
});
