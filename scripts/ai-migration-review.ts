/**
 * AI rolling-update compatibility review (PROD-8359, Phase 6 — extended).
 *
 * The intelligent VALIDATION layer over the marker's deterministic detectors.
 * When a release contains migrations and/or the deterministic detectors flag a
 * breaking change (the SQL-shape linter on migrations, `oasdiff` on the REST spec,
 * the MCP tool-surface snapshot diff), this reviewer asks Claude the one question
 * a shape-only check can't answer: would the PREVIOUS release's running code keep
 * working during a rolling deployment?
 *
 * During a Kubernetes rolling update the migration runs FIRST, then the new app
 * rolls out gradually — so the previous release's pods (and an already-loaded
 * frontend, and external API/MCP clients) keep serving traffic against the new
 * schema / new API until the rollout finishes. Shape alone never decides safety:
 *   - a destructive migration is safe IF the old code stopped using the object
 *     (expand/contract); an "additive" one is unsafe if a new constraint rejects
 *     what the old code still writes;
 *   - a "breaking" REST/MCP change flagged by oasdiff/the snapshot may break the
 *     in-flight frontend (old JS → new pod, or new JS → old pod) OR may only
 *     affect a removed/external surface no in-flight consumer hits.
 * Only reading the old AND new code can tell — which is what this agent does.
 *
 * AGENTIC: Claude gets read-only tools scoped to BOTH sides — `grep_old_code` /
 * `read_old_file` (the PREVIOUS release, via `git … <lastTag>`) and `grep_new_code`
 * / `read_new_file` / `diff_file` (the release under review, via `git … <newRef>`)
 * — so it can trace whether a changed object/endpoint is actually read or served by
 * the code that keeps running mid-rollout.
 *
 * Raw Messages API via global fetch (Node 20+); no SDK dependency. System prompt,
 * the inputs turn, and a single rolling breakpoint carry `cache_control` so the
 * large prefix is read from cache (~0.1x) across the tool loop.
 *
 * Importable: `aiRollingUpdateReview(opts)` returns a structured result, or `null`
 * on any fail-safe degrade (error / refusal / truncation / budget exhaustion).
 * The generator treats `null` as "leave rollingUpdateSafe unknown".
 *
 * CLI:  npx tsx scripts/ai-migration-review.ts --last-tag 0.3233.0 --version 0.3234.0
 * Reads ANTHROPIC_API_KEY from the environment (the CI secret of the same name).
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
const MAX_DIFF_CHARS = 16000;
const MAX_TOKENS = 16000;

export type TriState = boolean | 'unknown';

/** A surface the review can pass judgement on. */
export type ReviewSurface = 'migration' | 'rest-api' | 'mcp-api' | 'other';

export interface AiReviewFinding {
    surface: ReviewSurface;
    /** The thing judged: a migration basename, an endpoint, a tool name, … */
    ref: string;
    classification: string;
    reason: string;
}

export interface AiReviewResult {
    modelVerdict: 'safe' | 'breaking' | 'unknown';
    confidence: 'low' | 'medium' | 'high';
    rollingUpdateSafe: TriState;
    recommendedStrategy: 'Recreate' | 'RollingUpdate';
    summary: string;
    findings: AiReviewFinding[];
    toolCalls: number;
    usage: { input: number; output: number; cacheRead: number };
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

export function addedMigrationPaths(lastTag: string): string[] {
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

function makeTools() {
    return [
        {
            name: 'grep_old_code',
            description:
                "Search the PREVIOUS release's source (the code that keeps running during the rolling update) for a regex. Use this to find where a column/table/constraint a migration changes — or an endpoint/tool an API change touches — is read, written, or called. Returns matching lines (file:line:text), capped.",
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['pattern'],
                properties: {
                    pattern: { type: 'string', description: 'An extended regex (ERE) to search for — alternation a|b and groups (…) work unescaped.' },
                    path_glob: { type: 'string', description: "Optional pathspec to limit the search, e.g. 'packages/backend/src' or 'packages/frontend/src'." },
                },
            },
        },
        {
            name: 'read_old_file',
            description: "Read a file from the PREVIOUS release's source by path. Returns the file content (capped). Use after grep to inspect how a schema object/endpoint is used by the code that keeps running mid-rollout.",
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['path'],
                properties: { path: { type: 'string', description: 'Repo-relative path, e.g. packages/backend/src/models/Foo.ts' } },
            },
        },
        {
            name: 'grep_new_code',
            description:
                "Search the NEW release-under-review source for a regex (same engine as grep_old_code). Use to see how the change re-shapes an object/endpoint/tool, or whether the bundled frontend now depends on a new API shape. Returns matching lines (file:line:text), capped.",
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['pattern'],
                properties: {
                    pattern: { type: 'string', description: 'An extended regex (ERE).' },
                    path_glob: { type: 'string', description: 'Optional pathspec to limit the search.' },
                },
            },
        },
        {
            name: 'read_new_file',
            description: "Read a file from the NEW release-under-review source by path. Returns the file content (capped).",
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['path'],
                properties: { path: { type: 'string', description: 'Repo-relative path.' } },
            },
        },
        {
            name: 'diff_file',
            description: "Show what changed in ONE file between the previous release and the release under review (git diff <lastTag>..<newRef> -- <path>). Use to see exactly how a flagged file (a migration, an API handler, a serializer) was modified. Returns a unified diff, capped.",
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['path'],
                properties: { path: { type: 'string', description: 'Repo-relative path to diff.' } },
            },
        },
    ];
}

interface ToolRefs {
    lastTag: string;
    newRef: string;
}

function runTool(name: string, input: Record<string, unknown>, refs: ToolRefs): { text: string; isError: boolean } {
    const grepAt = (ref: string): { text: string; isError: boolean } => {
        const pattern = String(input.pattern ?? '');
        if (!pattern) return { text: 'error: empty pattern', isError: true };
        // -E: extended regex (the model writes ERE-style alternation/groups by default)
        const args = ['grep', '-n', '-I', '-E', '--no-color', '-e', pattern, ref];
        if (input.path_glob) args.push('--', String(input.path_glob));
        const { ok, out } = git(args);
        if (!ok) return { text: `git grep failed: ${out}`, isError: true };
        const lines = out.split('\n').filter(Boolean);
        const shown = lines.slice(0, MAX_GREP_LINES).join('\n');
        const suffix = lines.length > MAX_GREP_LINES ? `\n... (${lines.length - MAX_GREP_LINES} more matches; refine the pattern)` : '';
        return { text: lines.length ? shown + suffix : '(no matches)', isError: false };
    };
    const readAt = (ref: string): { text: string; isError: boolean } => {
        const path = String(input.path ?? '');
        if (!path) return { text: 'error: empty path', isError: true };
        const { ok, out } = git(['show', `${ref}:${path}`]);
        if (!ok) return { text: `cannot read ${path} at ${ref}: ${out}`, isError: true };
        const body = out.length > MAX_READ_CHARS ? `${out.slice(0, MAX_READ_CHARS)}\n... (truncated)` : out;
        return { text: body, isError: false };
    };

    if (name === 'grep_old_code') return grepAt(refs.lastTag);
    if (name === 'read_old_file') return readAt(refs.lastTag);
    if (name === 'grep_new_code') return grepAt(refs.newRef);
    if (name === 'read_new_file') return readAt(refs.newRef);
    if (name === 'diff_file') {
        const path = String(input.path ?? '');
        if (!path) return { text: 'error: empty path', isError: true };
        const { ok, out } = git(['diff', `${refs.lastTag}..${refs.newRef}`, '--', path]);
        if (!ok) return { text: `cannot diff ${path}: ${out}`, isError: true };
        if (!out.trim()) return { text: '(no changes to that path in this range)', isError: false };
        const body = out.length > MAX_DIFF_CHARS ? `${out.slice(0, MAX_DIFF_CHARS)}\n... (diff truncated)` : out;
        return { text: body, isError: false };
    }
    return { text: `unknown tool ${name}`, isError: true };
}

const SCHEMA_DOC = `{
  "verdict": "safe" | "breaking" | "unknown",
  "confidence": "low" | "medium" | "high",
  "findings": [{ "surface": "migration" | "rest-api" | "mcp-api" | "other", "ref": "<migration basename / endpoint / tool name>", "classification": "additive-safe" | "breaking" | "needs-review", "reason": "<one sentence, cite old/new-code evidence where you checked it>" }],
  "summary": "<2-3 sentences>"
}`;

const SYSTEM = `You review a release for ROLLING-DEPLOYMENT safety in a self-hosted app (Lightdash; Knex.js migrations on Postgres; an Express REST API consumed by a bundled React frontend; an MCP tool server).

During a Kubernetes rolling update the database migration runs FIRST, then the new app rolls out gradually — so until the rollout finishes the PREVIOUS release's application code keeps serving traffic against the ALREADY-MIGRATED schema, an already-loaded frontend keeps calling whichever pod (old or new) it lands on, and external REST/MCP clients keep calling too. Your job: decide whether anything in this release would break the previous release's running code (or break already-running clients) during that overlap window.

You are the VALIDATION layer over deterministic detectors. They flag changes by SHAPE; you decide whether the shape is actually breaking by reading the code. The inputs you may be given:

1. MIGRATIONS (the added Knex migration files, inline). Central question for EVERY migration — destructive OR additive in shape — is: does the PREVIOUS release's running code SUPPORT this schema change? An "additive" shape is NOT automatically safe (a new NOT NULL column old INSERTs don't populate, a new UNIQUE/CHECK/FOREIGN KEY the old writes can violate, a narrowed type, a new enum value the old read path doesn't expect, a data backfill). A destructive shape is NOT automatically unsafe: under expand/contract a drop/rename is safe IF the previous release already stopped using the object — VERIFY with grep_old_code that there are ZERO references; a guess is needs-review, never safe.

2. REST API BREAKING CHANGES (flagged by oasdiff on the OpenAPI spec). For each: does it break a consumer that is live DURING the rollout? The highest-stakes consumer is the bundled frontend — an already-loaded OLD frontend tab will hit NEW pods (and a NEW frontend will hit OLD pods) until the rollout completes and the user reloads. Use grep_old_code / grep_new_code over packages/frontend/src to see whether the frontend actually calls the changed endpoint with the changed shape. classification: breaking if an in-flight frontend (or a documented internal caller) would get errors mid-rollout; additive-safe if you VERIFY no in-flight consumer depends on the removed/changed part (e.g. a newly-removed endpoint the frontend already stopped calling, or an added optional field); needs-review if you can't tell. A change that only affects EXTERNAL third-party API scripts (not the in-flight frontend) is a consumer concern but NOT by itself a reason to block a RollingUpdate — say so in the reason and lean additive-safe for the rolling-update question while noting the external break.

3. MCP TOOL BREAKING CHANGES (flagged by the tool-surface snapshot diff). Same logic for MCP clients/agents: a removed tool, a newly-required input, a removed input, or a retyped input breaks an agent mid-call. Judge whether an in-flight MCP session would break.

USE THE TOOLS on everything you're given — identify the schema objects / endpoints / tools involved and trace them through the old and new code. Verified-from-code judgements can be additive-safe or breaking; anything you can only guess is needs-review.

Classification rules:
- additive-safe: you VERIFIED the previous release's running code (and any in-flight client) keeps working — old inserts still satisfy every constraint, old reads tolerate the new shape, a dropped/renamed object has ZERO old references, a "breaking" API change touches nothing the in-flight frontend/clients use.
- breaking: NOT NULL without default; a drop/rename of an object the old code STILL references; a type narrowing; a CHECK/FK that could reject rows the old code writes; a non-concurrent index on a large/hot table; a data backfill the old code depends on; a REST/MCP change an in-flight frontend or client would hit and error on.
- needs-review: you could not verify the behaviour the safety depends on.

Be conservative: overall verdict is "safe" with confidence "high" ONLY when EVERY input is additive-safe (verified). Any breaking → verdict "breaking". Any unresolved needs-review → verdict at most "unknown".

When you have finished investigating, reply with ONE JSON object and NOTHING else, matching:
${SCHEMA_DOC}`;

type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> };

function extractJson(text: string): unknown {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fence ? fence[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    return JSON.parse(candidate);
}

async function callApi(apiKey: string, messages: unknown[], tools: unknown[]): Promise<{
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
            // cache_control on the last (only) system block caches tools + system.
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
            tools,
            messages,
        }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return res.json() as Promise<{ content: Block[]; stop_reason?: string; usage?: Record<string, number> }>;
}

/**
 * Move the single rolling cache breakpoint onto the last block of the last
 * message, clearing any previous rolling mark (but never the statically-cached
 * first message at index 0). Keeps total breakpoints ≤ 3.
 */
function markRollingCache(messages: unknown[]): void {
    for (let i = 1; i < messages.length; i += 1) {
        const content = (messages[i] as { content?: unknown }).content;
        if (Array.isArray(content)) {
            for (const b of content) {
                if (b && typeof b === 'object') delete (b as { cache_control?: unknown }).cache_control;
            }
        }
    }
    const last = messages[messages.length - 1] as { content?: unknown };
    if (messages.length > 1 && Array.isArray(last.content) && last.content.length > 0) {
        (last.content[last.content.length - 1] as { cache_control?: unknown }).cache_control = { type: 'ephemeral' };
    }
}

export interface AiReviewOpts {
    apiKey: string;
    lastTag: string;
    version: string;
    /** New side to diff/read against; defaults to HEAD. */
    newRef?: string;
    /** Deterministic REST breaking changes (oasdiff text) to validate. */
    restBreaking?: string[];
    /** Deterministic MCP tool-surface breaking changes to validate. */
    mcpBreaking?: string[];
    /**
     * Findings the deterministic SQL-shape linter already flagged on the
     * migrations (rendered strings). Passed so the AI VALIDATES the linter's
     * specific findings — confirm each is a real break, or clear it as a safe
     * expand/contract — rather than re-deriving the shape blind from the files.
     */
    sqlLintFindings?: string[];
    log?: (msg: string) => void;
}

/** Build the inputs-turn text from whatever surfaces were flagged. */
function buildInputsText(opts: {
    version: string;
    lastTag: string;
    migrationFiles: string[];
    migrationBlocks: string[];
    sqlLintFindings: string[];
    restBreaking: string[];
    mcpBreaking: string[];
}): string {
    const sections: string[] = [
        `Release ${opts.version} since ${opts.lastTag}. Investigate every input below against the ${opts.lastTag} (old) and new code using your tools, then give the JSON verdict.`,
    ];
    if (opts.migrationBlocks.length) {
        const linterNote = opts.sqlLintFindings.length
            ? `\n\nThe deterministic SQL-shape linter flagged these shapes as POTENTIALLY breaking — resolve EACH: confirm it's a real break the previous release's code can't survive, or clear it as a safe expand/contract by verifying with grep_old_code that the previous release no longer references the object:\n${opts.sqlLintFindings.map((f) => `- ${f}`).join('\n')}`
            : '';
        sections.push(
            `## Migrations (${opts.migrationBlocks.length} added)${linterNote}\n\n${opts.migrationBlocks.join('\n\n')}`,
        );
    }
    if (opts.restBreaking.length) {
        sections.push(
            `## REST API changes flagged breaking by oasdiff (${opts.restBreaking.length})\n\nValidate each against the in-flight frontend (packages/frontend/src) and documented internal callers:\n${opts.restBreaking.map((c) => `- ${c}`).join('\n')}`,
        );
    }
    if (opts.mcpBreaking.length) {
        sections.push(
            `## MCP tool-surface changes flagged breaking (${opts.mcpBreaking.length})\n\nValidate whether an in-flight MCP client/agent would break:\n${opts.mcpBreaking.map((c) => `- ${c}`).join('\n')}`,
        );
    }
    return sections.join('\n\n');
}

/**
 * Runs the agentic review. Returns a structured result, or `null` on any
 * fail-safe degrade (the caller must treat null as "stay unknown / Recreate").
 * Returns null immediately when there is nothing to review (no migrations and no
 * flagged REST/MCP breaking changes).
 */
export async function aiRollingUpdateReview(opts: AiReviewOpts): Promise<AiReviewResult | null> {
    const log = opts.log ?? (() => {});
    const newRef = opts.newRef ?? 'HEAD';
    const restBreaking = opts.restBreaking ?? [];
    const mcpBreaking = opts.mcpBreaking ?? [];
    const sqlLintFindings = opts.sqlLintFindings ?? [];
    const paths = addedMigrationPaths(opts.lastTag);
    if (paths.length === 0 && restBreaking.length === 0 && mcpBreaking.length === 0) return null;

    const fileBlocks = paths.map((p) => {
        let body = fs.readFileSync(p, 'utf-8');
        if (body.length > MAX_FILE_CHARS) body = `${body.slice(0, MAX_FILE_CHARS)}\n/* ...truncated... */`;
        return `### ${p}\n\`\`\`typescript\n${body}\n\`\`\``;
    });

    const tools = makeTools();
    const messages: unknown[] = [
        {
            role: 'user',
            // cache_control here caches the (large, stable) inputs prefix so the
            // tool loop re-reads it at ~0.1x instead of full price each turn.
            content: [
                {
                    type: 'text',
                    text: buildInputsText({
                        version: opts.version,
                        lastTag: opts.lastTag,
                        migrationFiles: paths,
                        migrationBlocks: fileBlocks,
                        sqlLintFindings,
                        restBreaking,
                        mcpBreaking,
                    }),
                    cache_control: { type: 'ephemeral' },
                },
            ],
        },
    ];

    const refs: ToolRefs = { lastTag: opts.lastTag, newRef };
    let toolCalls = 0;
    let inTok = 0;
    let outTok = 0;
    let cacheRead = 0;

    for (let turn = 0; turn < MAX_TOOL_CALLS + 1; turn += 1) {
        // Rolling cache breakpoint: cache the growing transcript so each turn
        // re-reads prior turns at ~0.1x. Keep the static breakpoints (system +
        // the first inputs message) and move a single rolling one onto the last
        // block of the last message — total stays within the 4-breakpoint limit.
        markRollingCache(messages);
        let resp;
        try {
            resp = await callApi(opts.apiKey, messages, tools);
        } catch (err) {
            log(`degrade: API error: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
        inTok += resp.usage?.input_tokens ?? 0;
        outTok += resp.usage?.output_tokens ?? 0;
        cacheRead += resp.usage?.cache_read_input_tokens ?? 0;

        if (resp.stop_reason === 'refusal') { log('degrade: model refused'); return null; }
        if (resp.stop_reason === 'max_tokens') { log('degrade: response truncated (raise max_tokens)'); return null; }

        messages.push({ role: 'assistant', content: resp.content });
        const toolUses = resp.content.filter((b) => b.type === 'tool_use');

        if (toolUses.length === 0) {
            const textBlock = resp.content.find((b) => b.type === 'text' && b.text);
            if (!textBlock?.text) { log('degrade: no final text'); return null; }
            let v: { verdict: 'safe' | 'breaking' | 'unknown'; confidence: 'low' | 'medium' | 'high'; findings: AiReviewFinding[]; summary: string };
            try {
                v = extractJson(textBlock.text) as typeof v;
            } catch {
                log('degrade: could not parse final JSON');
                return null;
            }
            let rollingUpdateSafe: TriState;
            if (v.verdict === 'breaking') rollingUpdateSafe = false;
            else if (v.verdict === 'safe' && v.confidence === 'high') rollingUpdateSafe = true;
            else rollingUpdateSafe = 'unknown';
            return {
                modelVerdict: v.verdict,
                confidence: v.confidence,
                rollingUpdateSafe,
                recommendedStrategy: rollingUpdateSafe === true ? 'RollingUpdate' : 'Recreate',
                summary: v.summary,
                findings: Array.isArray(v.findings) ? v.findings : [],
                toolCalls,
                usage: { input: inTok, output: outTok, cacheRead },
            };
        }

        if (toolCalls >= MAX_TOOL_CALLS) { log(`degrade: tool-call budget exhausted (${MAX_TOOL_CALLS})`); return null; }
        const results = toolUses.map((tu) => {
            toolCalls += 1;
            const r = runTool(tu.name as string, (tu.input ?? {}) as Record<string, unknown>, refs);
            return { type: 'tool_result', tool_use_id: tu.id, content: r.text, is_error: r.isError };
        });
        messages.push({ role: 'user', content: results });
    }
    log('degrade: loop did not converge');
    return null;
}

/** @deprecated renamed to aiRollingUpdateReview; kept as an alias for callers. */
export const aiMigrationReview = aiRollingUpdateReview;

// ---- CLI --------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    const version = arg('version') ?? '(next)';
    const lastTag = arg('last-tag') ?? arg('previous-version');
    if (!lastTag) throw new Error('--last-tag (or --previous-version) is required');

    const paths = addedMigrationPaths(lastTag);
    if (paths.length === 0) {
        console.log(`No migrations added in ${lastTag}..HEAD. (Pass REST/MCP breaking inputs via the generator to review those surfaces.)`);
    } else {
        console.log(`\n=== AI rolling-update review: ${lastTag} → ${version} (${paths.length} migrations) ===`);
    }
    const r = await aiRollingUpdateReview({ apiKey, lastTag, version, newRef: arg('new-ref'), log: (m) => console.log(m) });
    if (!r) {
        console.log(`→ rollingUpdateSafe: "unknown"  recommendedStrategy: Recreate  (nothing to review or fail-safe degrade)`);
        return;
    }
    console.log(`model verdict : ${r.modelVerdict} (confidence: ${r.confidence})  [${r.toolCalls} tool calls]`);
    console.log(`→ rollingUpdateSafe: ${JSON.stringify(r.rollingUpdateSafe)}  recommendedStrategy: ${r.recommendedStrategy}`);
    console.log(`summary       : ${r.summary}\n`);
    for (const f of r.findings) {
        console.log(`  • [${f.surface}] ${f.ref}`);
        console.log(`      [${f.classification}] ${f.reason}`);
    }
    console.log(`\ntokens: in=${r.usage.input} out=${r.usage.output} cache_read=${r.usage.cacheRead}`);
}

const invokedDirectly = require.main === module || process.argv[1]?.endsWith('ai-migration-review.ts') === true;
if (invokedDirectly) {
    main().catch((err) => {
        console.error(`[ai-migration-review] FAILED: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    });
}
