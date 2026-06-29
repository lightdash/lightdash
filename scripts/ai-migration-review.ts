/**
 * AI migration-safety review (PROD-8359, Phase 6).
 *
 * Gated second stage for the release-safety marker: when a release contains
 * migrations and rollingUpdateSafe is "unknown", ask Claude whether the new
 * migrations are backward-compatible with the PREVIOUS release's running code
 * during a rolling deployment.
 *
 * This is an AGENTIC reviewer — Claude gets two read-only tools scoped to the
 * previous release's source (`grep_old_code`, `read_old_file`, both via
 * `git ... <lastTag>`) so it can check whether the old code actually reads or
 * writes the columns/tables/constraints a migration changes. Without that, a
 * migration can only ever be classified "needs-review"; with it, additive-but-
 * app-dependent migrations can be positively cleared to "safe".
 *
 * Raw Messages API via global fetch (Node 20+); no SDK dependency.
 * Reads ANTHROPIC_API_KEY from the environment (the CI secret of the same name).
 *
 * Run: source the key, then
 *   npx tsx scripts/ai-migration-review.ts --last-tag 0.3233.0 --version 0.3234.0
 *
 * FAIL-SAFE: any error, refusal, truncation, or loop exhaustion degrades to
 * "unknown" (recommendedStrategy: Recreate) and exits 0 — it never emits a
 * falsely-safe verdict, and it never fails the release (the load-bearing
 * migrations.present signal lives in the generator, not here).
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';

const MODEL = 'claude-opus-4-8';
const MIGRATION_DIRS = [
    'packages/backend/src/database/migrations',
    'packages/backend/src/ee/database/migrations',
];
const MIGRATION_FILENAME_RE = /^\d{14}_.+\.(ts|js)$/;
const MAX_FILE_CHARS = 8000;
const MAX_TOOL_CALLS = 40;
const MAX_GREP_LINES = 80;
const MAX_READ_CHARS = 12000;
const MAX_TOKENS = 16000;

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function git(args: string[]): { ok: boolean; out: string } {
    try {
        return { ok: true, out: execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }) };
    } catch (err) {
        const e = err as { status?: number; stderr?: Buffer; stdout?: Buffer };
        // git grep exits 1 with no error when there are simply no matches
        if (e.status === 1) return { ok: true, out: e.stdout?.toString() ?? '' };
        return { ok: false, out: (e.stderr?.toString() || (err as Error).message).slice(0, 2000) };
    }
}

function addedMigrationPaths(lastTag: string): string[] {
    const { out } = git(['diff', '--name-status', `${lastTag}..HEAD`, '--', ...MIGRATION_DIRS]);
    const paths: string[] = [];
    for (const line of out.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        if (parts[0].charAt(0) !== 'A') continue;
        const p = parts[parts.length - 1];
        if (MIGRATION_FILENAME_RE.test(p.split('/').pop() as string)) paths.push(p);
    }
    return paths.sort();
}

// ---- tools (read-only, scoped to the previous release tree) -----------------

function makeTools() {
    return [
        {
            name: 'grep_old_code',
            description:
                "Search the PREVIOUS release's source (the code that keeps running during the rolling update) for a regex. Use this to find where a column/table/constraint the migration changes is read or written. Returns matching lines (file:line:text), capped.",
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['pattern'],
                properties: {
                    pattern: { type: 'string', description: 'An extended regex (ERE) to search for — alternation a|b and groups (…) work unescaped.' },
                    path_glob: { type: 'string', description: "Optional pathspec to limit the search, e.g. 'packages/backend/src'." },
                },
            },
        },
        {
            name: 'read_old_file',
            description: "Read a file from the PREVIOUS release's source by path. Returns the file content (capped). Use after grep to inspect how a schema object is used.",
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['path'],
                properties: {
                    path: { type: 'string', description: 'Repo-relative path, e.g. packages/backend/src/models/Foo.ts' },
                },
            },
        },
    ];
}

function runTool(name: string, input: Record<string, unknown>, lastTag: string): { text: string; isError: boolean } {
    if (name === 'grep_old_code') {
        const pattern = String(input.pattern ?? '');
        if (!pattern) return { text: 'error: empty pattern', isError: true };
        // -E: extended regex (the model writes ERE-style alternation/groups by default)
        const args = ['grep', '-n', '-I', '-E', '--no-color', '-e', pattern, lastTag];
        if (input.path_glob) args.push('--', String(input.path_glob));
        const { ok, out } = git(args);
        if (!ok) return { text: `git grep failed: ${out}`, isError: true };
        const lines = out.split('\n').filter(Boolean);
        const shown = lines.slice(0, MAX_GREP_LINES).join('\n');
        const suffix = lines.length > MAX_GREP_LINES ? `\n... (${lines.length - MAX_GREP_LINES} more matches; refine the pattern)` : '';
        return { text: lines.length ? shown + suffix : '(no matches)', isError: false };
    }
    if (name === 'read_old_file') {
        const path = String(input.path ?? '');
        if (!path) return { text: 'error: empty path', isError: true };
        const { ok, out } = git(['show', `${lastTag}:${path}`]);
        if (!ok) return { text: `cannot read ${path} at ${lastTag}: ${out}`, isError: true };
        const body = out.length > MAX_READ_CHARS ? `${out.slice(0, MAX_READ_CHARS)}\n... (truncated)` : out;
        return { text: body, isError: false };
    }
    return { text: `unknown tool ${name}`, isError: true };
}

const SCHEMA_DOC = `{
  "verdict": "safe" | "breaking" | "unknown",
  "confidence": "low" | "medium" | "high",
  "perMigration": [{ "file": "<basename>", "classification": "additive-safe" | "breaking" | "needs-review", "reason": "<one sentence, cite old-code evidence where you checked it>" }],
  "summary": "<2-3 sentences>"
}`;

const SYSTEM = `You review database migrations for rolling-deployment safety in a self-hosted app (Lightdash; Knex.js migrations on Postgres).

During a Kubernetes rolling update the migration runs FIRST, then the new app rolls out gradually — so the PREVIOUS release's application code keeps serving traffic against the ALREADY-MIGRATED schema until the rollout finishes. Decide whether the migrations below would break that previous-version code.

You have read-only tools (grep_old_code, read_old_file) that read the PREVIOUS release's source. USE THEM: for each migration, identify the schema objects it changes (tables, columns, constraints, indexes) and grep the old code to see whether/how they're read or written. Backward-compatibility you can only guess from the migration text is "needs-review"; backward-compatibility you have verified against the old code can be "additive-safe" or "breaking".

Classification rules:
- additive-safe: nullable column, column with default, new table, index created CONCURRENTLY, new enum value — AND nothing in the old code path breaks.
- breaking: NOT NULL without default, drop/rename column or table, type narrowing, a CHECK/FOREIGN KEY that could reject rows the old code still writes, a non-concurrent index on a large/hot table, a data backfill that rewrites values the old code depends on.
- needs-review: you could not verify the old-code behaviour the safety depends on.

Be conservative: overall verdict is "safe" with confidence "high" ONLY when EVERY migration is additive-safe (verified). Any breaking → verdict "breaking". Any unresolved needs-review → verdict at most "unknown".

When you have finished investigating, reply with ONE JSON object and NOTHING else, matching:
${SCHEMA_DOC}`;

type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> };

function extractJson(text: string): unknown {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fence ? fence[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    return JSON.parse(candidate);
}

async function callApi(apiKey: string, system: string, messages: unknown[], tools: unknown[]): Promise<{
    content: Block[];
    stop_reason?: string;
    usage?: Record<string, number>;
}> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
            system,
            tools,
            messages,
        }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return res.json() as Promise<{ content: Block[]; stop_reason?: string; usage?: Record<string, number> }>;
}

function degrade(reason: string): never {
    console.log(`\n→ rollingUpdateSafe: "unknown"  recommendedStrategy: Recreate  (${reason})`);
    process.exit(0);
}

async function main(): Promise<void> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const version = arg('version') ?? '(next)';
    const lastTag = arg('last-tag') ?? arg('previous-version');
    if (!lastTag) throw new Error('--last-tag (or --previous-version) is required');

    const paths = addedMigrationPaths(lastTag);
    if (paths.length === 0) {
        console.log(`No migrations added in ${lastTag}..HEAD — nothing to review.`);
        return;
    }

    const fileBlocks = paths.map((p) => {
        let body = fs.readFileSync(p, 'utf-8');
        if (body.length > MAX_FILE_CHARS) body = `${body.slice(0, MAX_FILE_CHARS)}\n/* ...truncated... */`;
        return `### ${p}\n\`\`\`typescript\n${body}\n\`\`\``;
    });

    const tools = makeTools();
    const messages: unknown[] = [
        {
            role: 'user',
            content:
                `Release ${version} adds ${paths.length} migration(s) since ${lastTag}. Investigate each against the ${lastTag} app code using your tools, then give the JSON verdict.\n\n` +
                fileBlocks.join('\n\n'),
        },
    ];

    let toolCalls = 0;
    let inTok = 0;
    let outTok = 0;
    console.log(`\n=== AI migration review: ${lastTag} → ${version} (${paths.length} migrations) ===`);

    for (let turn = 0; turn < MAX_TOOL_CALLS + 1; turn += 1) {
        let resp;
        try {
            resp = await callApi(apiKey, SYSTEM, messages, tools);
        } catch (err) {
            degrade(`API error: ${err instanceof Error ? err.message : String(err)}`);
        }
        inTok += resp.usage?.input_tokens ?? 0;
        outTok += resp.usage?.output_tokens ?? 0;

        if (resp.stop_reason === 'refusal') degrade('model refused');
        if (resp.stop_reason === 'max_tokens') degrade('response truncated (raise max_tokens)');

        messages.push({ role: 'assistant', content: resp.content });
        const toolUses = resp.content.filter((b) => b.type === 'tool_use');

        if (toolUses.length === 0) {
            const textBlock = resp.content.find((b) => b.type === 'text' && b.text);
            if (!textBlock?.text) degrade('no final text');
            let v: { verdict: string; confidence: string; perMigration: Array<{ file: string; classification: string; reason: string }>; summary: string };
            try {
                v = extractJson(textBlock!.text as string) as typeof v;
            } catch {
                degrade('could not parse final JSON');
            }
            let safe: boolean | 'unknown';
            if (v!.verdict === 'breaking') safe = false;
            else if (v!.verdict === 'safe' && v!.confidence === 'high') safe = true;
            else safe = 'unknown';

            console.log(`model verdict : ${v!.verdict} (confidence: ${v!.confidence})  [${toolCalls} tool calls]`);
            console.log(`→ rollingUpdateSafe: ${JSON.stringify(safe)}  recommendedStrategy: ${safe === true ? 'RollingUpdate' : 'Recreate'}`);
            console.log(`summary       : ${v!.summary}\n`);
            for (const m of v!.perMigration) {
                console.log(`  • ${m.file.split('/').pop()}`);
                console.log(`      [${m.classification}] ${m.reason}`);
            }
            console.log(`\ntokens: in=${inTok} out=${outTok}`);
            return;
        }

        if (toolCalls >= MAX_TOOL_CALLS) degrade(`tool-call budget exhausted (${MAX_TOOL_CALLS})`);
        const results = toolUses.map((tu) => {
            toolCalls += 1;
            const r = runTool(tu.name as string, (tu.input ?? {}) as Record<string, unknown>, lastTag);
            return { type: 'tool_result', tool_use_id: tu.id, content: r.text, is_error: r.isError };
        });
        messages.push({ role: 'user', content: results });
    }
    degrade('loop did not converge');
}

main().catch((err) => {
    console.error(`[ai-migration-review] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
