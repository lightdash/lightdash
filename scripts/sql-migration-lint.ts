/**
 * Deterministic SQL-shape migration linter (PROD-8359).
 *
 * The always-on, non-LLM FLOOR under the P6 AI migration review. It statically
 * scans the `up()` body of each added Knex migration for operation shapes that
 * break the PREVIOUS release's running code during a rolling update — drops,
 * renames, NOT NULL without a default, and their raw-SQL equivalents — the same
 * class of checks as Squawk / Atlas `migrate lint` / strong_migrations, adapted
 * to Knex's TypeScript builder (our migrations are `.ts`, not raw `.sql`).
 *
 * Why static, not run-against-a-DB: it reuses the exact migration-file list the
 * P6 reviewer already reads (`addedMigrationPaths`), needs no Postgres, no deps,
 * and is fully deterministic — so it can run on every migration-bearing release
 * for free and its verdict is reproducible (unlike the AI review).
 *
 * Precedence: deterministic detectors (this linter, the REST diff, and the MCP
 * snapshot diff) always run first, and a breaking result sets the marker's floor.
 * The AI rolling-update review then validates every migration-bearing release and
 * flagged REST/MCP break. A definitive verdict can clear or confirm that floor;
 * an inconclusive "unknown" never downgrades a deterministic break. Bias is
 * intentionally toward over-flagging, but a false Recreate means real operator
 * downtime — the downstream AI layer exists to clear those false positives. This
 * linter is a FLOOR, not a complete check: code/config-only breaks and subtle
 * data-backfill breaks remain the AI review's and the blind-spot note's job.
 *
 * Known limitations:
 *   - `down()` bodies are not scanned, so rollback safety is unexamined.
 *   - Modified or renamed historical migrations are not linted; only added files
 *     are scanned.
 *   - PR preview merge-base ranges can include already-merged migrations in
 *     criss-cross merge histories.
 *
 * CLI: stdout contains only the final JSON; diagnostics are written to stderr.
 *       npx tsx scripts/sql-migration-lint.ts --last-tag 0.3260.2
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { addedMigrationPaths } from './ai-migration-review';
import { parseChangeDeclarations } from './breaking-change-declarations';
import {
    breakingChangeDecisionBrief,
    hollowBreakingReasonMessage,
    isSubstantiveBreakingReason,
} from './breaking-change-gate-policy';
import {
    collectBreakingChangeDeclarationsBetweenRefs,
    DEFAULT_DECLARATIONS_PATH,
} from './release-safety-declarations';
import type {
    BreakingChangeDeclaration,
    BreakingChangeDeclarationDiff,
} from './release-safety-declarations';
import { isMigrationPath } from './release-safety-migrations';

export interface SqlLintFinding {
    file: string;
    line: number;
    rule: string;
    message: string;
    snippet: string;
    /** The dropped/renamed schema object name (column/table), when extractable.
     *  Used to trace the expand version. undefined for non-string-literal args. */
    object?: string;
}

export interface SqlLintResult {
    /** True if the linter actually scanned at least one migration. */
    ran: boolean;
    breaking: boolean;
    findings: SqlLintFinding[];
}

/** Knex builder calls that are unambiguously destructive to the old code.
 *  `objectRe` (optional) captures the affected object name (group 1) from the
 *  first string-literal argument, for expand-version tracing. */
const METHOD_RULES: { rule: string; re: RegExp; message: string; objectRe?: RegExp }[] = [
    { rule: 'drop-column', re: /\.dropColumns?\s*\(/, message: 'drops a column the previous version may still read/write', objectRe: /\.dropColumns?\s*\(\s*['"]([^'"]+)['"]/ },
    { rule: 'drop-nullable', re: /\.dropNullable\s*\(/, message: 'enforces NOT NULL on an existing column (old code may still write NULL)', objectRe: /\.dropNullable\s*\(\s*['"]([^'"]+)['"]/ },
    { rule: 'rename-column', re: /\.renameColumn\s*\(/, message: 'renames a column the previous version still references', objectRe: /\.renameColumn\s*\(\s*['"]([^'"]+)['"]/ },
    { rule: 'drop-table', re: /\.dropTable(?:IfExists)?\s*\(/, message: 'drops a table the previous version still references', objectRe: /\.dropTable(?:IfExists)?\s*\(\s*['"]([^'"]+)['"]/ },
    { rule: 'rename-table', re: /\.renameTable\s*\(/, message: 'renames a table the previous version still references', objectRe: /\.renameTable\s*\(\s*['"]([^'"]+)['"]/ },
];

/** Raw-SQL phrases (only scanned inside statements that call `.raw(`). */
const RAW_RULES: { rule: string; re: RegExp; message: string }[] = [
    { rule: 'raw-drop-column', re: /\bdrop\s+column\b/i, message: 'raw SQL drops a column' },
    { rule: 'raw-drop-table', re: /\bdrop\s+table\b/i, message: 'raw SQL drops a table' },
    { rule: 'raw-rename-column', re: /\brename\s+column\b/i, message: 'raw SQL renames a column' },
    { rule: 'raw-rename-to', re: /\brename\s+to\b/i, message: 'raw SQL renames an object' },
    { rule: 'raw-set-not-null', re: /\bset\s+not\s+null\b/i, message: 'raw SQL sets a column NOT NULL (rejects old rows)' },
    { rule: 'raw-alter-type', re: /\balter\s+column\b[\s\S]*?\btype\b/i, message: 'raw SQL changes a column type' },
];

/** Best-effort: keep only the `up()` portion (everything before `down`). */
function upPortion(source: string): string {
    const m = source.search(
        /export\s+(?:async\s+)?(?:function|const)\s+down\b|exports\.down\b|(?:async\s+)?function\s+down\b/,
    );
    return m >= 0 ? source.slice(0, m) : source;
}

/**
 * Replace block-comment content with spaces while preserving newlines and source
 * offsets. Best-effort only: `/*` inside string literals is treated as a comment.
 */
function stripBlockComments(source: string): string {
    const chars = source.split('');
    let start = source.indexOf('/*');
    while (start >= 0) {
        const close = source.indexOf('*/', start + 2);
        const end = close >= 0 ? close + 2 : source.length;
        for (let i = start; i < end; i += 1) {
            if (chars[i] !== '\n') chars[i] = ' ';
        }
        start = source.indexOf('/*', end);
    }
    return chars.join('');
}

/** Strip line comments per line (keeps line numbers stable). */
function stripLineComment(line: string): string {
    return line.replace(/\/\/.*$/, '');
}

/**
 * Best-effort spans for `.raw(` calls. Parentheses inside quoted/backtick content
 * still affect depth; an unbalanced call extends to EOF.
 */
function rawSpans(source: string): Array<{ start: number; end: number }> {
    const spans: Array<{ start: number; end: number }> = [];
    let occurrence = source.indexOf('.raw(');
    while (occurrence >= 0) {
        const start = occurrence + '.raw'.length;
        let depth = 0;
        let end = source.length;
        for (let i = start; i < source.length; i += 1) {
            if (source[i] === '(') depth += 1;
            if (source[i] === ')') {
                depth -= 1;
                if (depth === 0) {
                    end = i + 1;
                    break;
                }
            }
        }
        spans.push({ start, end });
        occurrence = source.indexOf('.raw(', occurrence + '.raw('.length);
    }
    return spans;
}

function lineOfIndex(source: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index && i < source.length; i += 1) {
        if (source[i] === '\n') line += 1;
    }
    return line;
}

/**
 * PURE. Lint a single migration's source. Returns findings (without `file`).
 * Scans only the up() portion. Three rule families:
 *   - METHOD_RULES: destructive Knex builder calls (line-scanned).
 *   - NOT NULL without default: a `.notNullable()` in a non-createTable
 *     statement that has no `.defaultTo(` — breaking when added to an existing
 *     table (statement-scanned, best-effort).
 *   - RAW_RULES: destructive raw SQL, only inside statements calling `.raw(`.
 */
export function lintSource(source: string): Omit<SqlLintFinding, 'file'>[] {
    const up = stripBlockComments(upPortion(source));
    const findings: Omit<SqlLintFinding, 'file'>[] = [];

    // Destructive Knex builder calls are line-scanned after removing comments.
    const lines = up.split('\n');
    lines.forEach((rawLine, i) => {
        const line = stripLineComment(rawLine);
        for (const { rule, re, message, objectRe } of METHOD_RULES) {
            if (re.test(line)) {
                const object = objectRe ? line.match(objectRe)?.[1] : undefined;
                findings.push({ line: i + 1, rule, message, snippet: rawLine.trim().slice(0, 200), object });
            }
        }
    });

    // Raw-SQL phrases are scanned only inside `.raw(` call spans. Blank line
    // comments while preserving offsets so commented-out calls stay inert.
    const rawSource = up
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, (comment) => ' '.repeat(comment.length)))
        .join('\n');
    for (const { start, end } of rawSpans(rawSource)) {
        const span = rawSource.slice(start, end);
        for (const { rule, re, message } of RAW_RULES) {
            const match = span.match(re);
            if (match?.index !== undefined) {
                const index = start + match.index;
                const line = lineOfIndex(rawSource, index);
                findings.push({
                    line,
                    rule,
                    message,
                    snippet: lines[line - 1]?.trim().slice(0, 200) ?? '',
                });
            }
        }
    }

    // NOT NULL without default — context-aware, because splitting on `;` is
    // unreliable inside a createTable callback. For each `.notNullable(`:
    //   - find the nearest ENCLOSING table call; createTable => new table, no old
    //     rows/code, SAFE; alterTable/.table() (or none) => candidate break;
    //   - skip if the column chain has a `.defaultTo(` (checked in a window that
    //     spans the chain, in either order).
    const nn = /\.notNullable\s*\(/g;
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = nn.exec(up)) !== null) {
        const idx = m.index;
        const before = up.slice(0, idx);
        const lastCreate = before.lastIndexOf('createTable');
        const tableCall = /(?:alterTable|\.table\s*\()/g;
        let lastAlter = -1;
        let tm: RegExpExecArray | null;
        // eslint-disable-next-line no-cond-assign
        while ((tm = tableCall.exec(before)) !== null) lastAlter = tm.index;
        if (lastCreate >= 0 && lastCreate > lastAlter) continue; // inside createTable => safe

        const lineStart = before.lastIndexOf('\n') + 1;
        const windowEnd = Math.min(up.length, idx + 200);
        if (/\.defaultTo\s*\(/.test(up.slice(lineStart, windowEnd))) continue;

        findings.push({
            line: lineOfIndex(up, idx),
            rule: 'not-null-no-default',
            message: 'adds a NOT NULL column without a default (old code inserts rows without it)',
            snippet: lines[lineOfIndex(up, idx) - 1]?.trim().slice(0, 200) ?? '',
        });
    }

    return findings;
}

/** Render findings to compact marker-note strings. */
export function renderFindings(findings: SqlLintFinding[], max = 20): string[] {
    const out = findings
        .slice(0, max)
        .map((f) => `${f.file}:${f.line} ${f.message} [${f.rule}]`);
    if (findings.length > max) out.push(`… and ${findings.length - max} more finding(s)`);
    return out;
}

export interface LintMigrationsOpts {
    lastTag: string;
    newRef?: string;
    log?: (msg: string) => void;
}

/**
 * IO. Lint every migration added since `lastTag`. `ran: false` only if there
 * were no added migrations to scan. Reading failures on individual files are
 * skipped (logged) rather than fatal — the linter never fails the release.
 */
export function lintMigrations(opts: LintMigrationsOpts): SqlLintResult {
    const log = opts.log ?? (() => {});
    const newRef = opts.newRef ?? 'HEAD';
    const paths = addedMigrationPaths(opts.lastTag, newRef);
    if (paths.length === 0) return { ran: false, breaking: false, findings: [] };

    const findings: SqlLintFinding[] = [];
    for (const p of paths) {
        let source: string;
        try {
            source =
                newRef === 'HEAD'
                    ? fs.readFileSync(p, 'utf-8')
                    : execFileSync('git', ['show', `${newRef}:${p}`], {
                          encoding: 'utf-8',
                      });
        } catch (err) {
            log(`could not read ${p}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }
        for (const f of lintSource(source)) findings.push({ ...f, file: p });
    }

    return { ran: true, breaking: findings.length > 0, findings };
}

export type SqlMigrationEnforcementSeverity = 'error' | 'warning';

export interface SqlMigrationEnforcementFinding extends SqlLintFinding {
    severity: SqlMigrationEnforcementSeverity;
}

export interface SqlMigrationEnforcementResult {
    ran: boolean;
    passed: boolean;
    paths: string[];
    findings: SqlMigrationEnforcementFinding[];
    errors: SqlMigrationEnforcementFinding[];
    warnings: SqlMigrationEnforcementFinding[];
}

const MIGRATION_DIRS = [
    'packages/backend/src/database/migrations',
    'packages/backend/src/ee/database/migrations',
];

interface RawCall {
    index: number;
    line: number;
    argument: string;
    snippet: string;
}

function maskComments(source: string): string {
    let output = '';
    let index = 0;
    let quote: string | null = null;
    while (index < source.length) {
        const char = source[index];
        if (quote) {
            output += char;
            if (char === '\\') {
                output += source[index + 1] ?? '';
                index += 2;
                continue;
            }
            if (char === quote) quote = null;
            index += 1;
            continue;
        }
        if (char === "'" || char === '"' || char === '`') {
            quote = char;
            output += char;
            index += 1;
            continue;
        }
        if (char === '/' && source[index + 1] === '/') {
            while (index < source.length && source[index] !== '\n') {
                output += ' ';
                index += 1;
            }
            continue;
        }
        if (char === '/' && source[index + 1] === '*') {
            output += '  ';
            index += 2;
            while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
                output += source[index] === '\n' ? '\n' : ' ';
                index += 1;
            }
            if (index < source.length) {
                output += '  ';
                index += 2;
            }
            continue;
        }
        output += char;
        index += 1;
    }
    return output;
}

function skipSpace(source: string, start: number): number {
    let index = start;
    while (index < source.length && /\s/.test(source[index])) index += 1;
    return index;
}

function matchingDelimiter(source: string, start: number, open: string, close: string): number {
    let depth = 0;
    let quote: string | null = null;
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (char === '\\') {
                index += 1;
            } else if (char === quote) {
                quote = null;
            }
            continue;
        }
        if (char === "'" || char === '"' || char === '`') {
            quote = char;
            continue;
        }
        if (char === open) depth += 1;
        if (char === close) {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    return -1;
}

function rawCalls(source: string): RawCall[] {
    const masked = maskComments(source);
    const calls: RawCall[] = [];
    let index = 0;
    let quote: string | null = null;
    while (index < masked.length) {
        const char = masked[index];
        if (quote) {
            if (char === '\\') index += 1;
            else if (char === quote) quote = null;
            index += 1;
            continue;
        }
        if (char === "'" || char === '"' || char === '`') {
            quote = char;
            index += 1;
            continue;
        }
        if (char !== '.') {
            index += 1;
            continue;
        }
        let cursor = skipSpace(masked, index + 1);
        if (masked.slice(cursor, cursor + 3) !== 'raw' || /[A-Za-z0-9_$]/.test(masked[cursor + 3] ?? '')) {
            index += 1;
            continue;
        }
        cursor = skipSpace(masked, cursor + 3);
        if (masked[cursor] === '<') {
            const genericEnd = matchingDelimiter(masked, cursor, '<', '>');
            if (genericEnd < 0) {
                index += 1;
                continue;
            }
            cursor = skipSpace(masked, genericEnd + 1);
        }
        if (masked[cursor] !== '(') {
            index += 1;
            continue;
        }
        const end = matchingDelimiter(masked, cursor, '(', ')');
        if (end < 0) {
            index += 1;
            continue;
        }
        const argument = source.slice(cursor + 1, end).trim();
        calls.push({
            index,
            line: lineOfIndex(source, index),
            argument,
            snippet: source.slice(index, end + 1).trim().replace(/\s+/g, ' ').slice(0, 200),
        });
        index = end + 1;
    }
    return calls;
}

function enforcementFinding(
    file: string,
    line: number,
    rule: string,
    message: string,
    severity: SqlMigrationEnforcementSeverity,
    snippet = '',
    object?: string,
): SqlMigrationEnforcementFinding {
    return { file, line, rule, message, severity, snippet, object };
}

function transactionDisabled(source: string): boolean {
    return /export\s+const\s+config\b[\s\S]*?\{[\s\S]*?transaction\s*:\s*false\b/.test(
        maskComments(source),
    );
}

function rawSqlText(argument: string): string | null {
    const trimmed = argument.trim();
    const quote = trimmed[0];
    if (quote !== "'" && quote !== '"' && quote !== '`') return null;
    let value = '';
    let index = 1;
    while (index < trimmed.length) {
        if (trimmed[index] === '\\') {
            value += trimmed.slice(index, index + 2);
            index += 2;
            continue;
        }
        if (trimmed[index] === quote) {
            const rest = trimmed.slice(index + 1).trim();
            if (rest.length > 0 && !rest.startsWith(',')) return null;
            if (quote === '`' && value.includes('${')) return null;
            return value;
        }
        value += trimmed[index];
        index += 1;
    }
    return null;
}

function isKnownSafeRawSql(argument: string): boolean {
    const sql = rawSqlText(argument);
    if (sql === null) return false;
    if (/^\s*(?:set(?:\s+local)?|reset)\s+[A-Za-z_][\w.]*\b/i.test(sql)) return true;
    if (
        /^\s*select\b[\s\S]*?\bfrom\s+(?:pg_catalog\.|information_schema\.|pg_)[A-Za-z_][\w$]*/i.test(
            sql,
        )
    ) {
        return true;
    }
    if (/^\s*create\s+(?:unique\s+)?index\b/i.test(sql)) return true;
    if (/^\s*create\s+table\b/i.test(sql)) return true;
    if (/^\s*drop\s+index\b/i.test(sql)) return true;
    if (
        /^\s*alter\s+table\b[\s\S]*?\badd\s+(?:column\s+)?[A-Za-z_"$][\w"$]*\b/i.test(sql) &&
        !/\bnot\s+null\b/i.test(sql)
    ) {
        return true;
    }
    return false;
}

function concurrentIndexName(argument: string): string | null {
    const sql = rawSqlText(argument);
    if (sql === null) return null;
    const create = /\bcreate\s+(?:unique\s+)?index\s+concurrently\s+/i.exec(sql);
    if (!create) return null;
    const remainder = sql
        .slice(create.index + create[0].length)
        .replace(/^if\s+not\s+exists\s+/i, '');
    const match = /^(?:"([A-Za-z_][\w$]*)"|([A-Za-z_][\w$]*\b))/.exec(remainder);
    return match?.[1] ?? match?.[2] ?? null;
}

function ddlTableNames(calls: readonly RawCall[], up: string): string[] {
    const names = new Set<string>();
    for (const call of calls) {
        const sql = rawSqlText(call.argument);
        if (sql === null) continue;
        const tablePattern = /\b(?:alter|create|drop|truncate)\s+table(?:\s+if\s+(?:not\s+)?exists)?\s+(?:"([A-Za-z_][\w$]*)"|([A-Za-z_][\w$]*)(?:\.[A-Za-z_][\w$]*)?)/gi;
        let tableMatch: RegExpExecArray | null;
        while ((tableMatch = tablePattern.exec(sql)) !== null) {
            names.add(tableMatch[1] ?? tableMatch[2]);
        }
        const indexMatch = /\bcreate\s+(?:unique\s+)?index\b[\s\S]*?\bon\s+(?:"([A-Za-z_][\w$]*)"|([A-Za-z_][\w$]*)(?:\.[A-Za-z_][\w$]*)?)/i.exec(
            sql,
        );
        if (indexMatch) names.add(indexMatch[1] ?? indexMatch[2]);
    }
    const builderPattern = /\.\s*(?:alterTable|createTable|dropTable|dropTableIfExists|table|renameTable)\s*\(\s*['"]([^'"]+)['"]/g;
    let builderMatch: RegExpExecArray | null;
    while ((builderMatch = builderPattern.exec(maskComments(up))) !== null) {
        names.add(builderMatch[1]);
    }
    return [...names].sort();
}

function isResumableBackfill(argument: string, source: string): boolean {
    if (/\binsert\s+into\b/i.test(argument) && /\bon\s+conflict\b/i.test(argument)) return true;
    if (/\bdelete\s+from\b/i.test(argument) && /\bwhere\b/i.test(argument)) return true;
    if (/\bupdate\b/i.test(argument)) {
        const guarded = /\bwhere\b/i.test(argument) && /\b(?:is\s+null|is\s+distinct\s+from|not\s+exists)\b/i.test(argument);
        const batched = /\blimit\s+\d+\b/i.test(argument) && /\b(?:for\s*\(|while\s*\()/.test(source);
        return guarded || batched;
    }
    return false;
}

function downState(source: string): {
    state: 'missing' | 'noop' | 'invalid-throw' | 'real';
    line: number;
} {
    const masked = maskComments(source);
    const functionMatch = /(?:export\s+)?(?:async\s+)?function\s+down\b[^\{]*\{/.exec(masked);
    const arrowMatch = /(?:export\s+)?const\s+down\b[^=]*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*/.exec(masked);
    let start = -1;
    let body = '';
    if (functionMatch?.index !== undefined) {
        const open = functionMatch.index + functionMatch[0].lastIndexOf('{');
        const close = matchingDelimiter(masked, open, '{', '}');
        start = functionMatch.index;
        if (close >= 0) body = masked.slice(open + 1, close);
    } else if (arrowMatch?.index !== undefined) {
        start = arrowMatch.index;
        const bodyStart = arrowMatch.index + arrowMatch[0].length;
        if (masked[bodyStart] === '{') {
            const close = matchingDelimiter(masked, bodyStart, '{', '}');
            if (close >= 0) body = masked.slice(bodyStart + 1, close);
        } else {
            const end = masked.indexOf(';', bodyStart);
            body = masked.slice(bodyStart, end < 0 ? masked.length : end);
        }
    }
    if (start < 0) return { state: 'missing', line: 1 };
    const normalized = body.replace(/\s+/g, ' ').replace(/;+\s*$/, '').trim();
    if (
        normalized.length === 0 ||
        /^(?:return\s*)?(?:undefined|void\s+0|Promise\.resolve\s*\(\s*\))?$/.test(normalized)
    ) {
        return { state: 'noop', line: lineOfIndex(source, start) };
    }
    if (/^throw\b/.test(normalized) && !/^throw\s+(?:new\s+)?Error\s*\(\s*(['"`])irreversible:\s*[\s\S]*\1\s*\)$/.test(normalized)) {
        return { state: 'invalid-throw', line: lineOfIndex(source, start) };
    }
    return { state: 'real', line: lineOfIndex(source, start) };
}

export function evaluateMigrationSource(
    source: string,
    file = '<source>',
    breakingDeclarations: readonly BreakingChangeDeclaration[] = [],
): SqlMigrationEnforcementFinding[] {
    const findings: SqlMigrationEnforcementFinding[] = [];
    const declarations = parseChangeDeclarations(source, file);
    for (const declarationDiagnostic of declarations.diagnostics) {
        findings.push(
            enforcementFinding(
                file,
                declarationDiagnostic.line,
                `malformed-${declarationDiagnostic.declaration}-declaration`,
                declarationDiagnostic.message,
                'error',
            ),
        );
        if (
            declarationDiagnostic.declaration === 'breaking' &&
            declarationDiagnostic.message.includes(
                'breaking.reason must not be empty',
            )
        ) {
            findings.push(
                enforcementFinding(
                    file,
                    declarationDiagnostic.line,
                    'hollow-breaking-declaration',
                    hollowBreakingReasonMessage(
                        file,
                        declarationDiagnostic.line,
                    ),
                    'error',
                ),
            );
        }
    }

    if (declarations.breaking) {
        findings.push(
            enforcementFinding(
                file,
                declarations.breaking.line,
                'inline-breaking-declaration',
                `inline breaking declarations are not supported; add a stable ID to ${DEFAULT_DECLARATIONS_PATH}`,
                'error',
            ),
        );
    }

    const matchingDeclarations = breakingDeclarations.filter(
        (declaration) => declaration.migration === file,
    );
    for (const declaration of matchingDeclarations) {
        if (!isSubstantiveBreakingReason(declaration.reason)) {
            findings.push(
                enforcementFinding(
                    DEFAULT_DECLARATIONS_PATH,
                    1,
                    'hollow-breaking-declaration',
                    hollowBreakingReasonMessage(DEFAULT_DECLARATIONS_PATH, 1),
                    'error',
                ),
            );
        }
    }
    const substantiveBreakingDeclaration = matchingDeclarations.some(
        (declaration) => isSubstantiveBreakingReason(declaration.reason),
    );

    const legacy = lintSource(source);
    for (const finding of legacy) {
        findings.push({
            ...finding,
            file,
            severity: substantiveBreakingDeclaration ? 'warning' : 'error',
            message: substantiveBreakingDeclaration
                ? `${finding.message}; acknowledged by the release-safety declaration registry`
                : `${finding.message}; breaking behavior is not declared by a substantive product decision`,
        });
    }

    const classifiedBreaking = declarations.classification?.kind === 'breaking';
    if (
        (legacy.length > 0 || classifiedBreaking) &&
        !substantiveBreakingDeclaration
    ) {
        const detectedLine =
            declarations.classification?.line ?? legacy[0]?.line ?? 1;
        const detectedPattern = legacy[0]
            ? `${legacy[0].rule} — ${legacy[0].message}`
            : `classification kind "breaking" — ${declarations.classification?.reason}`;
        findings.push(
            enforcementFinding(
                file,
                detectedLine,
                'undeclared-breaking-change',
                breakingChangeDecisionBrief({
                    file,
                    line: detectedLine,
                    pattern: detectedPattern,
                    declarationLocation:
                        `${DEFAULT_DECLARATIONS_PATH} as a new stable ID with reason, requiredStop, and migration set to ${file}`,
                }),
                'error',
            ),
        );
    }
    if (classifiedBreaking) {
        findings.push(
            enforcementFinding(
                file,
                declarations.classification?.line ?? 1,
                'classified-breaking-change',
                `migration is classified as breaking: ${declarations.classification?.reason}`,
                substantiveBreakingDeclaration ? 'warning' : 'error',
            ),
        );
    }

    const up = upPortion(source);
    const calls = rawCalls(up);
    if (!declarations.classification) {
        for (const call of calls) {
            const knownBreaking = RAW_RULES.some((ruleValue) =>
                ruleValue.re.test(call.argument),
            );
            if (!knownBreaking && !isKnownSafeRawSql(call.argument)) {
                findings.push(
                    enforcementFinding(
                        file,
                        call.line,
                        'unclassified-knex-raw',
                        'knex.raw cannot be classified statically; add export const classification with kind and reason',
                        'error',
                        call.snippet,
                    ),
                );
            }
        }
    }

    const noTransaction = transactionDisabled(source);
    const hasInvalidIndexCleanup = /\bpg_index\b/i.test(up) && /\bindisvalid\b/i.test(up);
    for (const call of calls) {
        const concurrentIfNotExists = /\bcreate\s+(?:unique\s+)?index\s+concurrently\s+if\s+not\s+exists\b/i.test(
            call.argument,
        );
        const bareConcurrent = /\bcreate\s+(?:unique\s+)?index\s+concurrently\s+(?!if\s+not\s+exists\b)/i.test(
            call.argument,
        );
        if (concurrentIfNotExists) {
            const indexName = concurrentIndexName(call.argument);
            if (indexName || !hasInvalidIndexCleanup) {
                const retryMessage = indexName
                    ? `CREATE INDEX CONCURRENTLY IF NOT EXISTS can preserve invalid index ${indexName}; its literal name is discoverable by the runtime retry guard`
                    : 'CREATE INDEX CONCURRENTLY IF NOT EXISTS uses a placeholder or dynamic index name that the runtime retry guard cannot discover; add explicit pg_index invalid-index cleanup';
                findings.push(
                    enforcementFinding(
                        file,
                        call.line,
                        'concurrent-index-invalid-retry',
                        retryMessage,
                        'warning',
                        call.snippet,
                    ),
                );
            }
        }
        if (noTransaction && bareConcurrent) {
            findings.push(
                enforcementFinding(
                    file,
                    call.line,
                    'non-resumable-concurrent-index',
                    'transaction:false with bare CREATE INDEX CONCURRENTLY is not retry-safe; use an explicit invalid-index cleanup strategy',
                    'error',
                    call.snippet,
                ),
            );
        }
        if (
            noTransaction &&
            /\b(?:update|insert\s+into|delete\s+from)\b/i.test(call.argument) &&
            !isResumableBackfill(call.argument, up)
        ) {
            findings.push(
                enforcementFinding(
                    file,
                    call.line,
                    'non-resumable-backfill',
                    'transaction:false backfill is not visibly resumable; add idempotent guards or bounded restart-safe batches',
                    'error',
                    call.snippet,
                ),
            );
        }
    }

    if (noTransaction && /\.update\s*\(/.test(maskComments(up)) && !/\.where(?:Null|NotNull)?\s*\(/.test(maskComments(up))) {
        const index = maskComments(up).search(/\.update\s*\(/);
        findings.push(
            enforcementFinding(
                file,
                lineOfIndex(up, index),
                'non-resumable-backfill',
                'transaction:false Knex update has no visible idempotent guard',
                'error',
                up.slice(index, index + 200).replace(/\s+/g, ' '),
            ),
        );
    }

    const ddl = calls.some((call) => /\b(?:alter|create|drop|truncate)\b/i.test(call.argument)) ||
        /\.schema\s*\.\s*(?:alterTable|createTable|dropTable|dropTableIfExists|renameTable|table)\s*\(/.test(maskComments(up));
    const lockTimeout = calls.some((call) => /\bset\s+(?:local\s+)?lock_timeout\b/i.test(call.argument));
    if (ddl && !lockTimeout) {
        const tables = ddlTableNames(calls, up);
        findings.push(
            enforcementFinding(
                file,
                1,
                'missing-lock-timeout',
                `DDL on table(s) ${tables.length > 0 ? tables.join(', ') : '<dynamic or unknown>'} has no SET LOCAL lock_timeout or SET lock_timeout protection`,
                'warning',
            ),
        );
    }

    const down = downState(source);
    if (down.state === 'missing') {
        findings.push(
            enforcementFinding(
                file,
                down.line,
                'missing-down',
                'migration must export a down function that rolls back or explicitly throws for an irreversible migration',
                'error',
            ),
        );
    } else if (down.state === 'noop') {
        findings.push(
            enforcementFinding(
                file,
                down.line,
                'silent-noop-down',
                'down must perform a rollback or explicitly throw; silently succeeding is not allowed',
                'error',
            ),
        );
    } else if (down.state === 'invalid-throw') {
        findings.push(
            enforcementFinding(
                file,
                down.line,
                'invalid-irreversible-down',
                'an irreversible down must explicitly throw an Error whose message starts with "irreversible:"',
                'error',
            ),
        );
    }

    return findings;
}

export function changedMigrationPathsFromNameStatus(
    output: string,
    exists: (path: string) => boolean = fs.existsSync,
): string[] {
    const paths: string[] = [];
    for (const line of output.split('\n')) {
        if (!line.trim()) continue;
        const fields = line.split('\t');
        if (!/^[AMRC]/.test(fields[0])) continue;
        const path = fields[fields.length - 1];
        if (
            MIGRATION_DIRS.some((directory) => path.startsWith(`${directory}/`)) &&
            isMigrationPath(path) &&
            exists(path)
        ) {
            paths.push(path);
        }
    }
    return [...new Set(paths)].sort();
}

export function changedMigrationPaths(base: string): string[] {
    const output = execFileSync(
        'git',
        ['diff', '--name-status', `${base}..HEAD`, '--', ...MIGRATION_DIRS],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    return changedMigrationPathsFromNameStatus(output);
}

export interface EvaluateMigrationEnforcementOptions {
    paths: readonly string[];
    readFile?: (path: string) => string;
    declarationChanges?: BreakingChangeDeclarationDiff;
}

export function evaluateMigrationEnforcement(
    options: EvaluateMigrationEnforcementOptions,
): SqlMigrationEnforcementResult {
    const readFile = options.readFile ?? ((path: string) => fs.readFileSync(path, 'utf8'));
    const paths = [...options.paths];
    const findings: SqlMigrationEnforcementFinding[] = [];
    const declarationChanges = options.declarationChanges ?? {
        added: [],
        diagnostics: [],
    };
    for (const diagnostic of declarationChanges.diagnostics) {
        findings.push(
            enforcementFinding(
                diagnostic.file,
                diagnostic.line,
                'breaking-declaration-registry',
                diagnostic.message,
                'error',
            ),
        );
    }
    for (const path of paths) {
        try {
            findings.push(
                ...evaluateMigrationSource(
                    readFile(path),
                    path,
                    declarationChanges.added,
                ),
            );
        } catch (error) {
            findings.push(
                enforcementFinding(
                    path,
                    1,
                    'migration-read-error',
                    `could not read changed migration: ${error instanceof Error ? error.message : String(error)}`,
                    'error',
                ),
            );
        }
    }
    const errors = findings.filter((finding) => finding.severity === 'error');
    const warnings = findings.filter((finding) => finding.severity === 'warning');
    return {
        ran: paths.length > 0,
        passed: errors.length === 0,
        paths,
        findings,
        errors,
        warnings,
    };
}

// ---- CLI --------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const lastTag = arg('last-tag') ?? arg('previous-version');
    if (!lastTag) throw new Error('--last-tag (or --previous-version) is required');
    if (process.argv.includes('--enforce')) {
        const result = evaluateMigrationEnforcement({
            paths: changedMigrationPaths(lastTag),
            declarationChanges: collectBreakingChangeDeclarationsBetweenRefs(
                lastTag,
                'HEAD',
            ),
        });
        for (const finding of result.findings) {
            const output = `${finding.file}:${finding.line} ${finding.severity.toUpperCase()} ${finding.message} [${finding.rule}]`;
            if (finding.severity === 'error') console.error(output);
            else console.warn(output);
        }
        console.log(
            `[sql-migration-lint] checked ${result.paths.length} changed migration(s): ${result.errors.length} error(s), ${result.warnings.length} warning(s)`,
        );
        if (!result.passed) process.exitCode = 1;
        return;
    }
    const result = lintMigrations({ lastTag, log: (m) => console.error(`[sql-migration-lint] ${m}`) });
    console.log(JSON.stringify({ ran: result.ran, breaking: result.breaking, findings: renderFindings(result.findings) }, null, 2));
}

const invokedDirectly =
    require.main === module || process.argv[1]?.endsWith('sql-migration-lint.ts') === true;
if (invokedDirectly) {
    try {
        main();
    } catch (err) {
        console.error(`[sql-migration-lint] FAILED: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}
