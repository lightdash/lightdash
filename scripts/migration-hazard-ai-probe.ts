import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 8000;
const MAX_TOOL_CALLS = 20;
const MAX_GREP_LINES = 80;
const MAX_READ_CHARS = 12000;
const REPO_ROOT = fs.realpathSync(path.resolve(__dirname, '..'));
const SOURCE_PATHS = [
    'packages/backend/src',
    'packages/common/src',
    'packages/frontend/src',
];

type Arm = 'blind' | 'assisted' | 'strict';
type TriState = boolean | 'unknown';
type HazardVerdict = 'hazardous' | 'safe' | 'not-a-backfill' | 'unknown';

interface Evidence {
    file: string;
    line: number;
    quote: string;
}

interface ProbeResult {
    file: string;
    arm: Arm;
    reMatchPossible: TriState;
    reMatchEvidence: Evidence[];
    contentionRisk: TriState;
    contentionEvidence: Evidence[];
    resumable: TriState;
    hazardVerdict: HazardVerdict;
    reasoning: string;
    toolCalls: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    latencyMs: number;
    error: string | null;
}

interface CliOptions {
    files: string[];
    arm: Arm;
    flagsPath: string | null;
    outPath: string;
}

interface ToolResult {
    text: string;
    isError: boolean;
}

interface ApiBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
}

interface ApiResponse {
    content: ApiBlock[];
    stop_reason?: string;
    usage?: Record<string, number>;
}

interface StaticReport {
    file: string;
    flags: Record<string, unknown>;
}

const SCHEMA_DOC = `{
  "file": string,
  "arm": "blind" | "assisted",
  "reMatchPossible": true | false | "unknown",
  "reMatchEvidence": [{ "file": string, "line": number, "quote": string }],
  "contentionRisk": true | false | "unknown",
  "contentionEvidence": [{ "file": string, "line": number, "quote": string }],
  "resumable": true | false | "unknown",
  "hazardVerdict": "hazardous" | "safe" | "not-a-backfill",
  "reasoning": string,
  "toolCalls": number,
  "inputTokens": number,
  "cachedInputTokens": number,
  "outputTokens": number,
  "latencyMs": number,
  "error": string | null
}`;

const SAFE_DEFINITION =
    '- "safe" = a batch loop that is bounded and/or lock-fenced.';
const STRICT_SAFE_DEFINITION =
    '- "safe" = a batch loop that is BOTH bounded (guaranteed to terminate) AND lock-fenced (a per-batch SET LOCAL lock_timeout, or an equivalent bound on how long a single batch can wait on a lock). A loop that is guaranteed to terminate but has no lock fence is hazardous, because an ordinary concurrent transaction holding a row lock will stall it indefinitely. Absence of explicit SELECT ... FOR UPDATE in application source is NOT evidence that no row locks are held.';

const SYSTEM = `You assess a database migration for OPERATIONAL HAZARD — whether it may fail to COMPLETE, or hold
locks that stall a live system. This is a SEPARATE question from rolling-update compatibility. Do
not comment on whether old code still works; another reviewer owns that. A migration can be fully
compatible and still be hazardous here.

You are given a migration containing a batched loop, plus static flags describing its shape.

Answer these, using the grep tools over the application source:

1. **Re-match.** The loop terminates when its batch predicate P selects zero rows. Can application
   code running *during the migration* INSERT or UPDATE rows that newly satisfy P? Find every write
   path to the affected table and check whether the column P tests can be written to a P-satisfying
   value. Report the file:line you relied on. If any write path can produce a P-matching row, the
   loop may never terminate. If none can, say so and cite the coercion.
2. **Contention.** Does application code hold long-lived transactions or row locks on this table
   during normal operation? A loop with no \`lock_timeout\` waits indefinitely behind such a lock —
   independently of question 1.
3. **Resumability.** If the migration is interrupted mid-loop, does re-running it resume correctly,
   or does it restart work already done?

Return findings as structured flags with the file:line evidence for each. Do NOT estimate durations,
row counts, or data volumes — you cannot see operator data and any such estimate is noise. Do NOT
emit a rolling-update verdict.

Return the result in a single fenced \`\`\`json block matching this schema:
${SCHEMA_DOC}

hazardVerdict definitions:
- "not-a-backfill" = the file has no row-batch scan loop at all (bounded DDL, fixed-collection iteration).
- "hazardous" = a batch loop that can fail to terminate or can stall indefinitely on a lock.
${SAFE_DEFINITION}`;

const STRICT_SYSTEM = SYSTEM.replace(
    SAFE_DEFINITION,
    STRICT_SAFE_DEFINITION,
);

class ApiError extends Error {
    status: number;
    retryAfterMs: number;

    constructor(status: number, message: string, retryAfterMs: number) {
        super(message);
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

function isInside(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate);
    return (
        relative === '' ||
        (!relative.startsWith(`..${path.sep}`) &&
            relative !== '..' &&
            !path.isAbsolute(relative))
    );
}

function resolveRepoFile(requestedPath: string): string {
    if (!requestedPath || path.isAbsolute(requestedPath)) {
        throw new Error('path must be a non-empty repo-relative path');
    }
    const candidate = path.resolve(REPO_ROOT, requestedPath);
    if (!isInside(REPO_ROOT, candidate)) {
        throw new Error('path is outside the repo root');
    }
    const realPath = fs.realpathSync(candidate);
    if (!isInside(REPO_ROOT, realPath)) {
        throw new Error('path resolves outside the repo root');
    }
    if (!fs.statSync(realPath).isFile()) {
        throw new Error('path is not a file');
    }
    return realPath;
}

function repoRelative(realPath: string): string {
    return path.relative(REPO_ROOT, realPath).split(path.sep).join('/');
}

function makeTools(): unknown[] {
    return [
        {
            name: 'grep_source',
            description:
                'Search the application source in the current repo working tree for a regular expression. Returns file:line:text matches capped at 80 lines.',
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['pattern'],
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'A ripgrep regular expression.',
                    },
                    path_glob: {
                        type: 'string',
                        description:
                            "Optional glob to limit matches, such as 'packages/backend/src/**/*.ts'.",
                    },
                },
            },
        },
        {
            name: 'read_source',
            description:
                'Read a repo-relative source file from the current working tree, optionally selecting a one-based inclusive line range. Returns line-numbered content capped at 12000 characters.',
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['path'],
                properties: {
                    path: {
                        type: 'string',
                        description:
                            'Repo-relative path, such as packages/backend/src/models/FooModel.ts.',
                    },
                    start_line: {
                        type: 'integer',
                        minimum: 1,
                        description: 'Optional one-based first line.',
                    },
                    end_line: {
                        type: 'integer',
                        minimum: 1,
                        description: 'Optional one-based inclusive last line.',
                    },
                },
            },
        },
    ];
}

function grepSource(input: Record<string, unknown>): ToolResult {
    const pattern = typeof input.pattern === 'string' ? input.pattern : '';
    if (!pattern) {
        return { text: 'error: empty pattern', isError: true };
    }
    if (
        input.path_glob !== undefined &&
        typeof input.path_glob !== 'string'
    ) {
        return { text: 'error: path_glob must be a string', isError: true };
    }

    const args = ['--line-number', '--no-heading', '--color', 'never'];
    if (input.path_glob) {
        args.push('--glob', input.path_glob);
    }
    args.push('--', pattern, ...SOURCE_PATHS);

    const result = spawnSync('rg', args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error) {
        return {
            text: `ripgrep failed: ${result.error.message}`,
            isError: true,
        };
    }
    if (result.status !== 0 && result.status !== 1) {
        return {
            text: `ripgrep failed: ${(result.stderr || '').slice(0, 2000)}`,
            isError: true,
        };
    }

    const lines = (result.stdout || '').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
        return { text: '(no matches)', isError: false };
    }
    const shown = lines.slice(0, MAX_GREP_LINES).join('\n');
    const suffix =
        lines.length > MAX_GREP_LINES
            ? `\n... (${lines.length - MAX_GREP_LINES} more matches; refine the pattern)`
            : '';
    return { text: shown + suffix, isError: false };
}

function positiveLine(
    input: Record<string, unknown>,
    key: 'start_line' | 'end_line',
): number | null {
    const value = input[key];
    if (value === undefined) return null;
    if (!Number.isInteger(value) || Number(value) < 1) {
        throw new Error(`${key} must be a positive integer`);
    }
    return Number(value);
}

function readSource(input: Record<string, unknown>): ToolResult {
    try {
        const requestedPath =
            typeof input.path === 'string' ? input.path : '';
        const realPath = resolveRepoFile(requestedPath);
        const startLine = positiveLine(input, 'start_line') ?? 1;
        const lines = fs.readFileSync(realPath, 'utf8').split(/\r?\n/);
        const endLine = positiveLine(input, 'end_line') ?? lines.length;
        if (endLine < startLine) {
            throw new Error('end_line must be greater than or equal to start_line');
        }
        const relativePath = repoRelative(realPath);
        const selected = lines
            .slice(startLine - 1, endLine)
            .map((line, index) => `${relativePath}:${startLine + index}:${line}`)
            .join('\n');
        return {
            text: selected.slice(0, MAX_READ_CHARS) || '(no content in range)',
            isError: false,
        };
    } catch (error) {
        return {
            text: `error: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
        };
    }
}

function runTool(
    name: string,
    input: Record<string, unknown>,
): ToolResult {
    if (name === 'grep_source') return grepSource(input);
    if (name === 'read_source') return readSource(input);
    return { text: `unknown tool ${name}`, isError: true };
}

function extractJson(text: string): unknown {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fence
        ? fence[1]
        : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    return JSON.parse(candidate);
}

function retryAfterMs(response: Response): number {
    const value = response.headers.get('retry-after');
    if (!value) return 1000;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) {
        return Math.min(Math.max(seconds * 1000, 0), 10000);
    }
    const date = Date.parse(value);
    if (Number.isNaN(date)) return 1000;
    return Math.min(Math.max(date - Date.now(), 0), 10000);
}

async function callApi(
    apiKey: string,
    messages: unknown[],
    tools: unknown[],
    system: string,
): Promise<ApiResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
            system: [
                {
                    type: 'text',
                    text: system,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            tools,
            messages,
        }),
    });
    if (!response.ok) {
        const body = (await response.text()).slice(0, 500);
        throw new ApiError(
            response.status,
            `Anthropic API ${response.status}: ${body}`,
            retryAfterMs(response),
        );
    }
    return response.json() as Promise<ApiResponse>;
}

function markRollingCache(messages: unknown[]): void {
    for (let index = 1; index < messages.length; index += 1) {
        const content = (messages[index] as { content?: unknown }).content;
        if (!Array.isArray(content)) continue;
        content.forEach((block) => {
            if (block && typeof block === 'object') {
                delete (block as { cache_control?: unknown }).cache_control;
            }
        });
    }
    const last = messages.at(-1) as { content?: unknown } | undefined;
    if (
        messages.length > 1 &&
        last &&
        Array.isArray(last.content) &&
        last.content.length > 0
    ) {
        (
            last.content.at(-1) as { cache_control?: unknown }
        ).cache_control = { type: 'ephemeral' };
    }
}

function isTriState(value: unknown): value is TriState {
    return value === true || value === false || value === 'unknown';
}

function isHazardVerdict(
    value: unknown,
): value is Exclude<HazardVerdict, 'unknown'> {
    return (
        value === 'hazardous' ||
        value === 'safe' ||
        value === 'not-a-backfill'
    );
}

function parseEvidence(value: unknown, field: string): Evidence[] {
    if (!Array.isArray(value)) {
        throw new Error(`${field} must be an array`);
    }
    return value.map((item) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`${field} contains a non-object`);
        }
        const evidence = item as Partial<Evidence>;
        if (
            typeof evidence.file !== 'string' ||
            !Number.isInteger(evidence.line) ||
            Number(evidence.line) < 1 ||
            typeof evidence.quote !== 'string'
        ) {
            throw new Error(`${field} contains invalid evidence`);
        }
        return {
            file: evidence.file,
            line: Number(evidence.line),
            quote: evidence.quote,
        };
    });
}

function parseFinding(value: unknown): {
    reMatchPossible: TriState;
    reMatchEvidence: Evidence[];
    contentionRisk: TriState;
    contentionEvidence: Evidence[];
    resumable: TriState;
    hazardVerdict: Exclude<HazardVerdict, 'unknown'>;
    reasoning: string;
} {
    if (!value || typeof value !== 'object') {
        throw new Error('final JSON must be an object');
    }
    const finding = value as Record<string, unknown>;
    if (!isTriState(finding.reMatchPossible)) {
        throw new Error('reMatchPossible is invalid');
    }
    if (!isTriState(finding.contentionRisk)) {
        throw new Error('contentionRisk is invalid');
    }
    if (!isTriState(finding.resumable)) {
        throw new Error('resumable is invalid');
    }
    if (!isHazardVerdict(finding.hazardVerdict)) {
        throw new Error('hazardVerdict is invalid');
    }
    if (typeof finding.reasoning !== 'string') {
        throw new Error('reasoning must be a string');
    }
    return {
        reMatchPossible: finding.reMatchPossible,
        reMatchEvidence: parseEvidence(
            finding.reMatchEvidence,
            'reMatchEvidence',
        ),
        contentionRisk: finding.contentionRisk,
        contentionEvidence: parseEvidence(
            finding.contentionEvidence,
            'contentionEvidence',
        ),
        resumable: finding.resumable,
        hazardVerdict: finding.hazardVerdict,
        reasoning: finding.reasoning,
    };
}

function errorResult(
    file: string,
    arm: Arm,
    error: string,
    toolCalls: number,
    inputTokens: number,
    cachedInputTokens: number,
    outputTokens: number,
    latencyMs: number,
): ProbeResult {
    return {
        file,
        arm,
        reMatchPossible: 'unknown',
        reMatchEvidence: [],
        contentionRisk: 'unknown',
        contentionEvidence: [],
        resumable: 'unknown',
        hazardVerdict: 'unknown',
        reasoning: 'unknown',
        toolCalls,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        latencyMs,
        error,
    };
}

function buildInput(
    file: string,
    source: string,
    arm: Arm,
    flags: Record<string, unknown> | null,
): string {
    const migration = `Migration file: ${file}
\`\`\`typescript
${source}
\`\`\``;
    if (arm !== 'assisted') return migration;
    return `${migration}

Static analysis reports the following flags:
\`\`\`json
${JSON.stringify(flags, null, 2)}
\`\`\`
Treat these flags as evidence to verify, not as a conclusion.`;
}

async function probeFile(
    apiKey: string,
    file: string,
    arm: Arm,
    flags: Record<string, unknown> | null,
): Promise<ProbeResult> {
    const startedAt = Date.now();
    let toolCalls = 0;
    let inputTokens = 0;
    let cachedInputTokens = 0;
    let outputTokens = 0;
    let retryUsed = false;

    try {
        const realPath = resolveRepoFile(file);
        const source = fs.readFileSync(realPath, 'utf8');
        const messages: unknown[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: buildInput(file, source, arm, flags),
                        cache_control: { type: 'ephemeral' },
                    },
                ],
            },
        ];
        const tools = makeTools();
        const system = arm === 'strict' ? STRICT_SYSTEM : SYSTEM;

        for (;;) {
            markRollingCache(messages);
            let response: ApiResponse;
            try {
                response = await callApi(apiKey, messages, tools, system);
            } catch (error) {
                if (
                    error instanceof ApiError &&
                    (error.status === 429 || error.status === 500) &&
                    !retryUsed
                ) {
                    retryUsed = true;
                    await new Promise((resolve) =>
                        setTimeout(resolve, error.retryAfterMs),
                    );
                    response = await callApi(
                        apiKey,
                        messages,
                        tools,
                        system,
                    );
                } else {
                    throw error;
                }
            }

            const cachedTokens =
                (response.usage?.cache_read_input_tokens ?? 0) +
                (response.usage?.cache_creation_input_tokens ?? 0);
            inputTokens +=
                (response.usage?.input_tokens ?? 0) + cachedTokens;
            cachedInputTokens += cachedTokens;
            outputTokens += response.usage?.output_tokens ?? 0;

            if (response.stop_reason === 'max_tokens') {
                throw new Error('response reached max_tokens');
            }
            if (response.stop_reason === 'refusal') {
                throw new Error('model refused the request');
            }

            messages.push({ role: 'assistant', content: response.content });
            const toolUses = response.content.filter(
                (block) => block.type === 'tool_use',
            );
            if (toolUses.length === 0) {
                const text = response.content.find(
                    (block) => block.type === 'text' && block.text,
                )?.text;
                if (!text) {
                    throw new Error('response contained no final text');
                }
                const finding = parseFinding(extractJson(text));
                return {
                    file,
                    arm,
                    ...finding,
                    toolCalls,
                    inputTokens,
                    cachedInputTokens,
                    outputTokens,
                    latencyMs: Date.now() - startedAt,
                    error: null,
                };
            }

            if (toolCalls + toolUses.length > MAX_TOOL_CALLS) {
                throw new Error(
                    `tool-call budget exhausted (${MAX_TOOL_CALLS})`,
                );
            }
            const results = toolUses.map((toolUse) => {
                toolCalls += 1;
                const result = runTool(
                    toolUse.name ?? '',
                    toolUse.input ?? {},
                );
                return {
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: result.text,
                    is_error: result.isError,
                };
            });
            messages.push({ role: 'user', content: results });
        }
    } catch (error) {
        return errorResult(
            file,
            arm,
            error instanceof Error ? error.message : String(error),
            toolCalls,
            inputTokens,
            cachedInputTokens,
            outputTokens,
            Date.now() - startedAt,
        );
    }
}

function parseCli(argv: string[]): CliOptions {
    const files: string[] = [];
    let arm: Arm | null = null;
    let flagsPath: string | null = null;
    let outPath: string | null = null;

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--files') {
            index += 1;
            while (index < argv.length && !argv[index].startsWith('--')) {
                files.push(argv[index]);
                index += 1;
            }
            index -= 1;
        } else if (argument === '--arm') {
            const value = argv[++index];
            if (
                value !== 'blind' &&
                value !== 'assisted' &&
                value !== 'strict'
            ) {
                throw new Error('--arm must be blind, assisted, or strict');
            }
            arm = value;
        } else if (argument === '--flags') {
            flagsPath = argv[++index] ?? null;
        } else if (argument === '--out') {
            outPath = argv[++index] ?? null;
        } else {
            throw new Error(`unknown argument: ${argument}`);
        }
    }

    if (files.length === 0) throw new Error('--files is required');
    if (!arm) throw new Error('--arm is required');
    if (!outPath) throw new Error('--out is required');
    if (arm === 'assisted' && !flagsPath) {
        throw new Error('--flags is required for the assisted arm');
    }
    return { files, arm, flagsPath, outPath };
}

function readStaticReports(flagsPath: string | null): Map<string, StaticReport> {
    const reports = new Map<string, StaticReport>();
    if (!flagsPath) return reports;
    const lines = fs
        .readFileSync(flagsPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    lines.forEach((line, index) => {
        const value = JSON.parse(line) as Partial<StaticReport>;
        if (
            typeof value.file !== 'string' ||
            !value.flags ||
            typeof value.flags !== 'object'
        ) {
            throw new Error(`invalid static report at line ${index + 1}`);
        }
        reports.set(value.file, {
            file: value.file,
            flags: value.flags as Record<string, unknown>,
        });
    });
    return reports;
}

async function main(): Promise<void> {
    const options = parseCli(process.argv.slice(2));
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not set');
    }
    const staticReports = readStaticReports(options.flagsPath);
    if (options.arm === 'assisted') {
        options.files.forEach((file) => {
            if (!staticReports.has(file)) {
                throw new Error(`no static flags found for ${file}`);
            }
        });
    }

    const outputPath = path.resolve(options.outPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, '');

    for (const [index, file] of options.files.entries()) {
        const result = await probeFile(
            apiKey,
            file,
            options.arm,
            staticReports.get(file)?.flags ?? null,
        );
        fs.appendFileSync(outputPath, `${JSON.stringify(result)}\n`);
        process.stderr.write(
            `[${index + 1}/${options.files.length}] ${path.basename(file)}: ${result.error ? 'error' : result.hazardVerdict}\n`,
        );
    }
}

const invokedDirectly =
    require.main === module ||
    process.argv[1]?.endsWith('migration-hazard-ai-probe.ts') === true;

if (invokedDirectly) {
    main().catch((error) => {
        process.stderr.write(
            `[migration-hazard-ai-probe] ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
    });
}
