import { type BackfillFact, type MigrationFact } from '@lightdash/common';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { isDeepStrictEqual } from 'util';
import { migrationContainsBackfill } from './derive-migration-facts';
import { parseFactsFile } from './preflight';

const MODEL = 'claude-opus-4-8';
const MAX_TOOL_CALLS = 20;
const MAX_TOKENS = 10000;
const MAX_GREP_LINES = 80;
const MAX_READ_CHARS = 16000;
const MAX_MIGRATION_CHARS = 24000;
const REPO_ROOT = path.resolve(__dirname, '..');

type ContentBlock = {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
};

interface MessagesResponse {
    content: ContentBlock[];
    stop_reason?: string;
}

export interface ProposalValidation {
    backfill: BackfillFact | null;
    rejectionReason: string | null;
}

export interface ProposalVerification {
    ok: boolean;
    reason: string | null;
}

export interface ProposeMigrationFactOptions {
    apiKey: string | null | undefined;
    previousTag: string;
    migrationPath: string;
    structuralFact: MigrationFact;
    verify: (fact: MigrationFact) => Promise<ProposalVerification>;
    log?: (message: string) => void;
}

interface ToolContext {
    previousTag: string;
    migrationPath: string;
    migrationSource: string;
}

const SYSTEM = `You propose SQL metadata for one Lightdash Postgres migration.

The supplied structural MigrationFact was derived deterministically from source and is authoritative. Return the complete fact with every field except backfill exactly unchanged. Fill only backfill.description, backfill.estimateSql, backfill.planSql, backfill.supportingIndexSql, and backfill.perPassCost. Do not add fields.

estimateSql must be one read-only SELECT that enumerates the rows the migration will touch. It runs against the PRE-UPGRADE schema, before this migration: never reference a table or column created by the migration itself. planSql is either null when estimateSql already represents the batch query shape, or one read-only SELECT shaped like the migration's batch. The EXPLAIN plan must touch every table declared read or write by the structural fact. PostgreSQL can eliminate LEFT JOINs when no selected expression depends on them, so select a column from every joined table. supportingIndexSql is null unless a useful index can be created entirely against the pre-upgrade schema; otherwise it must be one CREATE [UNIQUE] INDEX CONCURRENTLY statement with no semicolon.

perPassCost is "remaining" or "table" and describes what ONE batch costs as the backfill drains. Answer it by asking whether an index on the PRE-UPGRADE schema serves the batch predicate and ordering. Batching on an indexed column — a primary key, or any column with a suitable index — lets each pass seek straight to the next rows, so cost falls with the work remaining: "remaining". Batching on an unindexed predicate makes every pass scan or sort the whole table to find the next rows, so cost stays flat however little work is left: "table". Say "table" whenever you are unsure, because understating this tells an operator a long migration is short.

Use the tools to inspect the pre-upgrade source and schema migrations. Prefer null supportingIndexSql to speculative DDL. If no safe pre-upgrade SELECT can describe the backfill, return JSON null. When finished, return only one JSON value: either the complete MigrationFact or null.`;

function extractJson(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const start = Math.min(
        ...['{', '['].map((character) => {
            const index = text.indexOf(character);
            return index === -1 ? Number.POSITIVE_INFINITY : index;
        }),
    );
    if (!Number.isFinite(start)) return JSON.parse(text.trim());
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    return JSON.parse(text.slice(start, end + 1));
}

function structuralPart(fact: MigrationFact): Omit<MigrationFact, 'backfill'> {
    const { backfill: _backfill, ...structural } = fact;
    return structural;
}

function readOnlySelectRejection(sql: string): string | null {
    const trimmed = sql.trim();
    if (trimmed.length === 0) return 'SQL is empty';
    if (trimmed.includes(';')) return 'SQL contains a semicolon';

    const withoutStrings = trimmed
        .replace(/'(?:''|[^'])*'/g, "''")
        .replace(/"(?:""|[^"])*"/g, '""')
        .replace(/--[^\n\r]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const tokens: string[] =
        withoutStrings.toUpperCase().match(/[A-Z_]+/g) ?? [];
    if (tokens[0] !== 'SELECT' && tokens[0] !== 'WITH') {
        return 'SQL must start with SELECT or WITH';
    }
    if (!tokens.includes('SELECT')) return 'SQL does not contain SELECT';
    const forbidden = [
        'ALTER',
        'ANALYZE',
        'CALL',
        'COPY',
        'CREATE',
        'DELETE',
        'DO',
        'DROP',
        'GRANT',
        'INSERT',
        'MERGE',
        'REFRESH',
        'REINDEX',
        'REVOKE',
        'TRUNCATE',
        'UPDATE',
        'VACUUM',
    ].find((keyword) => tokens.includes(keyword));
    if (forbidden !== undefined) return `SQL contains ${forbidden}`;
    if (tokens.includes('INTO')) return 'SELECT INTO is not read-only';
    for (let index = 0; index < tokens.length; index += 1) {
        if (
            tokens[index] === 'FOR' &&
            ['UPDATE', 'SHARE'].includes(tokens[index + 1] ?? '')
        ) {
            return 'SELECT row locking is not read-only';
        }
        if (
            tokens.slice(index, index + 4).join(' ') === 'FOR NO KEY UPDATE' ||
            tokens.slice(index, index + 4).join(' ') === 'FOR KEY SHARE'
        ) {
            return 'SELECT row locking is not read-only';
        }
    }
    return null;
}

function parseProposedFact(value: unknown): MigrationFact {
    const facts = parseFactsFile(
        JSON.stringify({
            schemaVersion: '1-draft',
            release: null,
            previousRelease: null,
            cumulativeThrough: null,
            migrationsInRelease: null,
            migrationsWithoutFacts: null,
            migrationFacts: [value],
        }),
    );
    return facts.migrationFacts[0];
}

export function validateMigrationFactProposal(
    responseText: string,
    structuralFact: MigrationFact,
): ProposalValidation {
    let raw: unknown;
    try {
        raw = extractJson(responseText);
    } catch {
        return {
            backfill: null,
            rejectionReason: 'could not parse final JSON',
        };
    }
    if (raw === null) {
        return {
            backfill: null,
            rejectionReason: 'model returned null',
        };
    }

    let proposedFact: MigrationFact;
    try {
        proposedFact = parseProposedFact(raw);
    } catch (error) {
        return {
            backfill: null,
            rejectionReason: `response does not match the facts schema: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    if (
        !isDeepStrictEqual(
            structuralPart(proposedFact),
            structuralPart(structuralFact),
        )
    ) {
        return {
            backfill: null,
            rejectionReason: 'model mutated structural fields',
        };
    }
    if (proposedFact.backfill === null) {
        return {
            backfill: null,
            rejectionReason: 'model returned no backfill',
        };
    }
    const backfillKeys = Object.keys(proposedFact.backfill).sort();
    const expectedBackfillKeys = [
        'description',
        'estimateSql',
        'planSql',
        'supportingIndexSql',
        'perPassCost',
    ].sort();
    if (!isDeepStrictEqual(backfillKeys, expectedBackfillKeys)) {
        return {
            backfill: null,
            rejectionReason: 'model returned unexpected backfill fields',
        };
    }
    if (proposedFact.backfill.description.trim().length === 0) {
        return {
            backfill: null,
            rejectionReason: 'backfill description is empty',
        };
    }
    const estimateRejection = readOnlySelectRejection(
        proposedFact.backfill.estimateSql,
    );
    if (estimateRejection !== null) {
        return {
            backfill: null,
            rejectionReason: `estimateSql rejected: ${estimateRejection}`,
        };
    }
    if (proposedFact.backfill.planSql !== null) {
        const planRejection = readOnlySelectRejection(
            proposedFact.backfill.planSql,
        );
        if (planRejection !== null) {
            return {
                backfill: null,
                rejectionReason: `planSql rejected: ${planRejection}`,
            };
        }
    }
    if (structuralFact.batchSize !== null) {
        if (proposedFact.backfill.planSql === null) {
            return {
                backfill: null,
                rejectionReason:
                    'batched migration requires a separate planSql',
            };
        }
        const limitPattern = new RegExp(
            `\\bLIMIT\\s+${structuralFact.batchSize}\\b`,
            'i',
        );
        if (!limitPattern.test(proposedFact.backfill.planSql)) {
            return {
                backfill: null,
                rejectionReason: `planSql does not contain LIMIT ${structuralFact.batchSize}`,
            };
        }
    }
    return { backfill: proposedFact.backfill, rejectionReason: null };
}

function git(args: string[]): { ok: boolean; output: string } {
    try {
        return {
            ok: true,
            output: execFileSync('git', args, {
                cwd: REPO_ROOT,
                encoding: 'utf8',
                maxBuffer: 32 * 1024 * 1024,
            }),
        };
    } catch (error) {
        const result = error as {
            status?: number;
            stdout?: Buffer;
            stderr?: Buffer;
        };
        if (result.status === 1) {
            return { ok: true, output: result.stdout?.toString() ?? '' };
        }
        return {
            ok: false,
            output:
                result.stderr?.toString() ??
                (error instanceof Error ? error.message : String(error)),
        };
    }
}

function safeRepoPath(filePath: string): boolean {
    return (
        filePath.length > 0 &&
        !path.isAbsolute(filePath) &&
        !filePath.split('/').includes('..')
    );
}

function tools(): unknown[] {
    return [
        {
            name: 'grep_pre_upgrade_source',
            description:
                'Search the pre-upgrade git tree for an extended regex. Use this to trace tables and columns and find their schema history.',
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['pattern'],
                properties: {
                    pattern: { type: 'string' },
                    path: { type: 'string' },
                },
            },
        },
        {
            name: 'read_pre_upgrade_file',
            description:
                'Read one repo-relative file from the pre-upgrade tree.',
            input_schema: {
                type: 'object',
                additionalProperties: false,
                required: ['path'],
                properties: { path: { type: 'string' } },
            },
        },
        {
            name: 'read_migration_source',
            description: 'Read the migration source being described.',
            input_schema: {
                type: 'object',
                additionalProperties: false,
                properties: {},
            },
        },
    ];
}

function runTool(
    name: string,
    input: Record<string, unknown>,
    context: ToolContext,
): { text: string; isError: boolean } {
    if (name === 'read_migration_source') {
        return { text: context.migrationSource, isError: false };
    }
    if (name === 'read_pre_upgrade_file') {
        const filePath = String(input.path ?? '');
        if (!safeRepoPath(filePath)) {
            return { text: 'error: unsafe or empty path', isError: true };
        }
        const result = git(['show', `${context.previousTag}:${filePath}`]);
        if (!result.ok) {
            return {
                text: `cannot read ${filePath}: ${result.output.slice(0, 2000)}`,
                isError: true,
            };
        }
        return {
            text:
                result.output.length > MAX_READ_CHARS
                    ? `${result.output.slice(0, MAX_READ_CHARS)}\n... (truncated)`
                    : result.output,
            isError: false,
        };
    }
    if (name === 'grep_pre_upgrade_source') {
        const pattern = String(input.pattern ?? '');
        const filePath = String(input.path ?? '');
        if (pattern.length === 0 || (filePath && !safeRepoPath(filePath))) {
            return { text: 'error: invalid pattern or path', isError: true };
        }
        const args = [
            'grep',
            '-n',
            '-I',
            '-E',
            '--no-color',
            '-e',
            pattern,
            context.previousTag,
        ];
        if (filePath) args.push('--', filePath);
        const result = git(args);
        if (!result.ok) {
            return {
                text: `git grep failed: ${result.output.slice(0, 2000)}`,
                isError: true,
            };
        }
        const lines = result.output.split('\n').filter(Boolean);
        return {
            text:
                lines.length === 0
                    ? '(no matches)'
                    : [
                          ...lines.slice(0, MAX_GREP_LINES),
                          ...(lines.length > MAX_GREP_LINES
                              ? [
                                    `... (${lines.length - MAX_GREP_LINES} more matches)`,
                                ]
                              : []),
                      ].join('\n'),
            isError: false,
        };
    }
    return { text: `unknown tool ${name}`, isError: true };
}

async function callApi(
    apiKey: string,
    messages: unknown[],
    availableTools: unknown[],
): Promise<MessagesResponse> {
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
                    text: SYSTEM,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            tools: availableTools,
            messages,
        }),
    });
    if (!response.ok) {
        throw new Error(
            `Anthropic API ${response.status}: ${(await response.text()).slice(0, 500)}`,
        );
    }
    return response.json() as Promise<MessagesResponse>;
}

function markRollingCache(messages: unknown[]): void {
    for (let index = 1; index < messages.length; index += 1) {
        const content = (messages[index] as { content?: unknown }).content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
            if (block && typeof block === 'object') {
                delete (block as { cache_control?: unknown }).cache_control;
            }
        }
    }
    const last = messages.at(-1) as { content?: unknown } | undefined;
    if (
        messages.length > 1 &&
        Array.isArray(last?.content) &&
        last.content.length > 0
    ) {
        (last.content.at(-1) as { cache_control?: unknown }).cache_control = {
            type: 'ephemeral',
        };
    }
}

async function requestProposal(
    apiKey: string,
    context: ToolContext,
    structuralFact: MigrationFact,
    log: (message: string) => void,
): Promise<BackfillFact | null> {
    const availableTools = tools();
    const migrationSource =
        context.migrationSource.length > MAX_MIGRATION_CHARS
            ? `${context.migrationSource.slice(0, MAX_MIGRATION_CHARS)}\n... (truncated)`
            : context.migrationSource;
    const messages: unknown[] = [
        {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: `Pre-upgrade git ref: ${context.previousTag}\nMigration path: ${context.migrationPath}\n\nAuthoritative structural fact:\n${JSON.stringify(structuralFact, null, 2)}\n\nMigration source:\n\`\`\`typescript\n${migrationSource}\n\`\`\``,
                    cache_control: { type: 'ephemeral' },
                },
            ],
        },
    ];
    let toolCalls = 0;
    for (let turn = 0; turn <= MAX_TOOL_CALLS; turn += 1) {
        markRollingCache(messages);
        let response: MessagesResponse;
        try {
            response = await callApi(apiKey, messages, availableTools);
        } catch (error) {
            log(
                `degrade: API error: ${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
        }
        if (response.stop_reason === 'refusal') {
            log('degrade: model refused');
            return null;
        }
        if (response.stop_reason === 'max_tokens') {
            log('degrade: response truncated');
            return null;
        }
        messages.push({ role: 'assistant', content: response.content });
        const toolUses = response.content.filter(
            (block) => block.type === 'tool_use',
        );
        if (toolUses.length === 0) {
            const textBlock = response.content.find(
                (block) => block.type === 'text' && block.text,
            );
            if (textBlock?.text === undefined) {
                log('degrade: no final text');
                return null;
            }
            const validation = validateMigrationFactProposal(
                textBlock.text,
                structuralFact,
            );
            if (validation.backfill === null) {
                log(`degrade: ${validation.rejectionReason}`);
            }
            return validation.backfill;
        }
        if (toolCalls + toolUses.length > MAX_TOOL_CALLS) {
            log(`degrade: tool-call budget exhausted (${MAX_TOOL_CALLS})`);
            return null;
        }
        toolCalls += toolUses.length;
        messages.push({
            role: 'user',
            content: toolUses.map((toolUse) => {
                const result = runTool(
                    toolUse.name ?? '',
                    toolUse.input ?? {},
                    context,
                );
                return {
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: result.text,
                    is_error: result.isError,
                };
            }),
        });
    }
    log('degrade: loop did not converge');
    return null;
}

export async function proposeMigrationFact(
    options: ProposeMigrationFactOptions,
): Promise<MigrationFact | null> {
    const log = options.log ?? (() => {});
    let migrationSource: string;
    try {
        migrationSource = fs.readFileSync(options.migrationPath, 'utf8');
    } catch (error) {
        log(
            `degrade: could not read migration: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
    }
    if (!migrationContainsBackfill(migrationSource)) {
        log('degrade: deterministic detector found no backfill');
        return null;
    }
    if (!options.apiKey) {
        log('degrade: ANTHROPIC_API_KEY is not set');
        return null;
    }
    const revision = git([
        'rev-parse',
        '--verify',
        `${options.previousTag}^{commit}`,
    ]);
    if (!revision.ok) {
        log(`degrade: invalid pre-upgrade ref ${options.previousTag}`);
        return null;
    }
    const context = {
        previousTag: options.previousTag,
        migrationPath: options.migrationPath,
        migrationSource,
    };
    const backfill = await requestProposal(
        options.apiKey,
        context,
        options.structuralFact,
        log,
    );
    if (backfill === null) return null;
    const candidate = { ...options.structuralFact, backfill };
    let verification: ProposalVerification;
    try {
        verification = await options.verify(candidate);
    } catch (error) {
        log(
            `degrade: verification error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
    }
    if (!verification.ok) {
        log(
            `degrade: verification failed: ${verification.reason ?? 'unknown'}`,
        );
        return null;
    }
    return candidate;
}
