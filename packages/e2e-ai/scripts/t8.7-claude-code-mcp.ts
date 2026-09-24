// Plan T8.7 (O): Claude Code as a third-party client of Lightdash's MCP
// server. A plain script, not a Playwright spec, because it drives the Claude
// Code CLI as a subprocess. Needs MCP_ENABLED=true, the `claude` CLI on the
// path and signed in, and the seed PAT. Run from packages/e2e-ai:
//
//     pnpm -F @lightdash/e2e-ai t8.7
//
// The server is given to Claude Code through a temporary --mcp-config with
// --strict-mcp-config, so the operator's own Claude Code configuration is
// never read or written (the plan's `claude mcp add/remove` would write it).
// Nothing is asserted about Claude Code's model or wording.

import { SEED_PAT } from '@lightdash/common';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { createPool, queryRows } from '../lib/db';
import { siteUrl } from '../lib/env';

const SERVER = 'lightdash';
const REQUIRED_TOOLS = ['list_explores', 'get_metadata'];
const PROMPT =
    'Using only the lightdash MCP tools, list the explores in the Jaffle shop project and then read the metadata of the orders explore. Reply with the tool names you called.';

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
};

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

const initEventSchema = z.object({
    type: z.literal('system'),
    subtype: z.literal('init'),
    mcp_servers: z.array(z.object({ name: z.string(), status: z.string() })),
    tools: z.array(z.string()),
});
const toolUseSchema = z.object({
    type: z.literal('assistant'),
    message: z.object({
        content: z.array(
            z.looseObject({ type: z.string(), name: z.string().optional() }),
        ),
    }),
});
const resultEventSchema = z.object({
    type: z.literal('result'),
    is_error: z.boolean(),
    result: z.string().optional(),
});

const discovery = async () => {
    const metadata = await fetch(
        new URL('/.well-known/oauth-authorization-server/api/v1/mcp', siteUrl),
    );
    const document = z
        .looseObject({ authorization_endpoint: z.string() })
        .safeParse(parseJson(await metadata.text()));
    check(
        metadata.ok && document.success,
        'discovery document is JSON with an authorization_endpoint',
    );
    const unauthenticated = await fetch(new URL('/api/v1/mcp', siteUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
    });
    check(
        unauthenticated.status === 401 &&
            (unauthenticated.headers.get('www-authenticate') ?? '').startsWith(
                'Bearer resource_metadata=',
            ),
        'unauthenticated POST answers 401 with WWW-Authenticate: Bearer resource_metadata=…',
    );
};

const runClaude = (workdir: string) => {
    const config = path.join(workdir, 'mcp.json');
    writeFileSync(
        config,
        JSON.stringify({
            mcpServers: {
                [SERVER]: {
                    type: 'http',
                    url: new URL('/api/v1/mcp', siteUrl).href,
                    headers: { Authorization: `ApiKey ${SEED_PAT.token}` },
                },
            },
        }),
    );
    return spawnSync(
        'claude',
        [
            '-p',
            PROMPT,
            '--output-format',
            'stream-json',
            '--verbose',
            '--mcp-config',
            config,
            '--strict-mcp-config',
            // No built-in tools, so it cannot answer from elsewhere.
            '--tools',
            '',
            '--allowedTools',
            `mcp__${SERVER}`,
            '--no-session-persistence',
        ],
        { cwd: workdir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
};

const main = async () => {
    await discovery();

    const db = createPool();
    const workdir = mkdtempSync(path.join(tmpdir(), 'e2e-ai-t8.7-'));
    const [clock] = await queryRows(
        db,
        'SELECT now() AS now',
        [],
        z.object({ now: z.date() }),
    );
    if (clock === undefined) throw new Error('Postgres returned no time');
    const { now } = clock;
    try {
        const claude = runClaude(workdir);
        check(
            claude.status === 0,
            `claude exited 0 (got ${claude.status}; ${claude.stderr.slice(0, 300)})`,
        );
        const events = claude.stdout
            .split('\n')
            .map(parseJson)
            .filter((event) => event !== null);

        const init = events.flatMap((event) => {
            const parsed = initEventSchema.safeParse(event);
            return parsed.success ? [parsed.data] : [];
        })[0];
        check(
            init?.mcp_servers.some(
                (server) =>
                    server.name === SERVER && server.status === 'connected',
            ) ?? false,
            `the client reports ${SERVER} connected`,
        );
        REQUIRED_TOOLS.forEach((tool) =>
            check(
                init?.tools.includes(`mcp__${SERVER}__${tool}`) ?? false,
                `the client lists ${tool}`,
            ),
        );

        const called = events.flatMap((event) => {
            const parsed = toolUseSchema.safeParse(event);
            return parsed.success
                ? parsed.data.message.content.flatMap((block) =>
                      block.type === 'tool_use' && block.name !== undefined
                          ? [block.name]
                          : [],
                  )
                : [];
        });
        REQUIRED_TOOLS.forEach((tool) =>
            check(
                called.includes(`mcp__${SERVER}__${tool}`),
                `the transcript calls ${tool}`,
            ),
        );
        const result = events.flatMap((event) => {
            const parsed = resultEventSchema.safeParse(event);
            return parsed.success ? [parsed.data] : [];
        })[0];
        check(
            result !== undefined && !result.is_error,
            'a JSON result without error',
        );

        const rows = await queryRows(
            db,
            `SELECT tool_name, status, auth_type, client_name, protocol_version
             FROM mcp_tool_call
             WHERE created_at >= $1 AND direction = 'inbound' AND tool_name = ANY($2)`,
            [now, REQUIRED_TOOLS],
            z.object({
                tool_name: z.string(),
                status: z.string(),
                auth_type: z.string().nullable(),
                client_name: z.string().nullable(),
                protocol_version: z.string().nullable(),
            }),
        );
        REQUIRED_TOOLS.forEach((tool) => {
            const forTool = rows.filter((row) => row.tool_name === tool);
            check(forTool.length > 0, `mcp_tool_call rows for ${tool}`);
            forTool.forEach((row) =>
                check(
                    row.status === 'success' &&
                        row.auth_type === 'pat' &&
                        (row.client_name ?? '') !== '' &&
                        (row.protocol_version ?? '') !== '',
                    `${tool}: status ${row.status}, auth ${row.auth_type}, client ${row.client_name}, protocol ${row.protocol_version}`,
                ),
            );
        });
    } finally {
        rmSync(workdir, { recursive: true, force: true });
        await db.end();
    }
    if (failures.length > 0) {
        console.error(`T8.7 failed: ${failures.length} check(s)`);
        process.exit(1);
    }
    console.log('T8.7 passed');
};

void main();
