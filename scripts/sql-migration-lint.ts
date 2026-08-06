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
import * as fs from 'fs';
import { addedMigrationPaths } from './ai-migration-review';

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
    log?: (msg: string) => void;
}

/**
 * IO. Lint every migration added since `lastTag`. `ran: false` only if there
 * were no added migrations to scan. Reading failures on individual files are
 * skipped (logged) rather than fatal — the linter never fails the release.
 */
export function lintMigrations(opts: LintMigrationsOpts): SqlLintResult {
    const log = opts.log ?? (() => {});
    const paths = addedMigrationPaths(opts.lastTag);
    if (paths.length === 0) return { ran: false, breaking: false, findings: [] };

    const findings: SqlLintFinding[] = [];
    for (const p of paths) {
        let source: string;
        try {
            source = fs.readFileSync(p, 'utf-8');
        } catch (err) {
            log(`could not read ${p}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }
        for (const f of lintSource(source)) findings.push({ ...f, file: p });
    }

    return { ran: true, breaking: findings.length > 0, findings };
}

// ---- CLI --------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const lastTag = arg('last-tag') ?? arg('previous-version');
    if (!lastTag) throw new Error('--last-tag (or --previous-version) is required');
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
