import { execFileSync } from 'node:child_process';

/** Knex migration files are timestamped: YYYYMMDDHHMMSS_description.ts */
const MIGRATION_FILENAME_RE = /^\d{14}_.+\.(ts|js)$/;

/**
 * Knex reads each migration directory non-recursively, so a file under
 * `__tests__/` is never run as a migration even when it is named after one.
 */
const MIGRATION_TEST_PATH_RE = /(^|\/)__tests__\//;

/**
 * PURE. Is this path a migration the release-safety tooling should act on?
 *
 * The test for a migration is not one. The repo colocates such tests as
 * `migrations/__tests__/<timestamp>_<name>.test.ts`, and knex never loads them.
 * Counting one inflates the shipped marker, feeds a non-migration to the
 * code-aware review, and fails the linter with advice — "export a down
 * function" — that cannot be followed.
 *
 * The rule is the directory, not the file name. A timestamped file sitting
 * directly in a migration directory IS loaded by knex, whatever it is called, so
 * a stray `<timestamp>_<name>.test.ts` there stays in scope: it will run as a
 * migration in production, and that is exactly what this tooling exists to
 * catch.
 *
 * Callers still scope the diff to the migration directories; this decides what
 * counts as a migration inside them.
 */
export function isMigrationPath(filePath: string): boolean {
    if (MIGRATION_TEST_PATH_RE.test(filePath)) return false;
    return MIGRATION_FILENAME_RE.test(filePath.split('/').pop() ?? '');
}

export interface MigrationHeaviness {
    locksTable: boolean | 'unknown';
    rewritesTable: boolean | 'unknown';
    scansTable: boolean | 'unknown';
}

export interface MigrationDetail {
    name: string;
    edition: 'core' | 'ee';
    tables: string[];
    heaviness: MigrationHeaviness;
}

export interface MigrationSourceAnalysis {
    migration: MigrationDetail;
    complete: boolean;
    incompleteReasons: MigrationIncompleteReason[];
}

export type MigrationIncompleteReason =
    | 'parse-failure'
    | 'column-alter'
    | 'unresolved-table-name';

export interface ReadMigrationMetadataOptions {
    paths: string[];
    ref: string;
    log?: (message: string) => void;
}

export interface MigrationMetadata {
    migrations: MigrationDetail[];
    complete: boolean;
}

type TokenKind =
    | 'identifier'
    | 'string'
    | 'template'
    | 'dynamicTemplate'
    | 'number'
    | 'regex'
    | 'punctuation'
    | 'operator';

interface Token {
    kind: TokenKind;
    value: string;
    start: number;
    end: number;
    depth: number;
}

interface TokenizedSource {
    tokens: Token[];
    valid: boolean;
}

type HeavinessKey = keyof MigrationHeaviness;
type OpeningDelimiter = '(' | '[' | '{';
type ClosingDelimiter = ')' | ']' | '}';

const UNKNOWN_HEAVINESS: MigrationHeaviness = {
    locksTable: 'unknown',
    rewritesTable: 'unknown',
    scansTable: 'unknown',
};

const assertUnreachable = (value: never, message: string): never => {
    throw new Error(`${message}: ${String(value)}`);
};

const matchingOpening = (delimiter: ClosingDelimiter): OpeningDelimiter => {
    switch (delimiter) {
        case ')':
            return '(';
        case ']':
            return '[';
        case '}':
            return '{';
        default:
            return assertUnreachable(delimiter, 'Unexpected closing delimiter');
    }
};

const decodeEscaped = (value: string): string =>
    value.replace(
        /\\(?:u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2})|([0btnvfr'"`\\])|(\r\n|[\n\r\u2028\u2029]))/g,
        (
            _match,
            codePoint,
            unicode,
            hex,
            escaped: string | undefined,
            lineContinuation: string | undefined,
        ) => {
            // A line continuation evaluates to nothing, so keeping it would
            // hide the keyword it splits.
            if (lineContinuation !== undefined) return '';
            if (codePoint !== undefined) {
                return String.fromCodePoint(Number.parseInt(codePoint, 16));
            }
            if (unicode !== undefined || hex !== undefined) {
                return String.fromCharCode(
                    Number.parseInt(unicode ?? hex, 16),
                );
            }
            const escapedValues: Record<string, string> = {
                '0': '\0',
                b: '\b',
                t: '\t',
                n: '\n',
                v: '\v',
                f: '\f',
                r: '\r',
                "'": "'",
                '"': '"',
                '`': '`',
                '\\': '\\',
            };
            return escaped === undefined ? '' : escapedValues[escaped];
        },
    );

const canStartRegex = (previous: Token | undefined): boolean => {
    if (previous === undefined || previous.kind === 'operator') return true;
    if (previous.kind === 'punctuation') {
        return ['(', '[', '{', ',', ';', ':'].includes(previous.value);
    }
    return (
        previous.kind === 'identifier' &&
        ['case', 'delete', 'return', 'throw', 'typeof', 'void'].includes(
            previous.value,
        )
    );
};

const tokenize = (source: string): TokenizedSource => {
    const tokens: Token[] = [];
    const stack: OpeningDelimiter[] = [];
    let index = 0;
    let valid = true;

    const add = (
        kind: TokenKind,
        value: string,
        start: number,
        end: number,
    ): void => {
        tokens.push({ kind, value, start, end, depth: stack.length });
    };

    while (index < source.length) {
        const character = source[index];
        if (/\s/.test(character)) {
            index += 1;
            continue;
        }
        if (source.startsWith('//', index)) {
            const newline = source.indexOf('\n', index + 2);
            index = newline < 0 ? source.length : newline + 1;
            continue;
        }
        if (source.startsWith('/*', index)) {
            const end = source.indexOf('*/', index + 2);
            if (end < 0) {
                valid = false;
                break;
            }
            index = end + 2;
            continue;
        }
        if (character === "'" || character === '"' || character === '`') {
            const start = index;
            const quote = character;
            let dynamic = false;
            index += 1;
            while (index < source.length) {
                if (source[index] === '\\') {
                    index += 2;
                    continue;
                }
                if (quote === '`' && source.startsWith('${', index)) {
                    dynamic = true;
                }
                if (source[index] === quote) break;
                index += 1;
            }
            if (index >= source.length) {
                valid = false;
                break;
            }
            index += 1;
            const raw = source.slice(start + 1, index - 1);
            add(
                quote === '`'
                    ? dynamic
                        ? 'dynamicTemplate'
                        : 'template'
                    : 'string',
                decodeEscaped(raw),
                start,
                index,
            );
            continue;
        }
        if (/[A-Za-z_$]/.test(character)) {
            const start = index;
            index += 1;
            while (index < source.length && /[\w$]/.test(source[index])) {
                index += 1;
            }
            add('identifier', source.slice(start, index), start, index);
            continue;
        }
        if (/\d/.test(character)) {
            const start = index;
            index += 1;
            while (index < source.length && /[\w.]/.test(source[index])) {
                index += 1;
            }
            add('number', source.slice(start, index), start, index);
            continue;
        }
        if (character === '/' && canStartRegex(tokens.at(-1))) {
            const start = index;
            let inClass = false;
            index += 1;
            while (index < source.length) {
                if (source[index] === '\\') {
                    index += 2;
                    continue;
                }
                if (source[index] === '[') inClass = true;
                if (source[index] === ']') inClass = false;
                if (source[index] === '/' && !inClass) break;
                if (source[index] === '\n') break;
                index += 1;
            }
            if (index >= source.length || source[index] !== '/') {
                valid = false;
                break;
            }
            index += 1;
            while (index < source.length && /[a-z]/i.test(source[index])) {
                index += 1;
            }
            add('regex', source.slice(start, index), start, index);
            continue;
        }

        const operator = [
            '===',
            '!==',
            '>>>',
            '**=',
            '??=',
            '&&=',
            '||=',
            '=>',
            '??',
            '||',
            '&&',
            '?.',
            '==',
            '!=',
            '<=',
            '>=',
            '++',
            '--',
            '**',
            '+=',
            '-=',
            '*=',
            '/=',
            '<<',
            '>>',
        ].find((candidate) => source.startsWith(candidate, index));
        if (operator !== undefined) {
            add('operator', operator, index, index + operator.length);
            index += operator.length;
            continue;
        }
        if ('()[]{}.,;:'.includes(character)) {
            if ([')', ']', '}'].includes(character)) {
                const closing = character as ClosingDelimiter;
                if (stack.pop() !== matchingOpening(closing)) valid = false;
            }
            add('punctuation', character, index, index + 1);
            if (['(', '[', '{'].includes(character)) {
                stack.push(character as OpeningDelimiter);
            }
            index += 1;
            continue;
        }
        add('operator', character, index, index + 1);
        index += 1;
    }

    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
        const token = tokens[tokenIndex];
        const next = tokens[tokenIndex + 1];
        if (
            token.kind === 'operator' &&
            token.value === '=' &&
            (next === undefined ||
                (next.kind === 'punctuation' &&
                    [')', ']', '}', ',', ';'].includes(next.value)))
        ) {
            valid = false;
        }
    }
    return { tokens, valid: valid && stack.length === 0 };
};

const migrationName = (migrationPath: string): string =>
    migrationPath.replace(/\\/g, '/').split('/').at(-1) ?? migrationPath;

const migrationEdition = (migrationPath: string): 'core' | 'ee' =>
    migrationPath.replace(/\\/g, '/').includes('/src/ee/database/migrations/')
        ? 'ee'
        : 'core';

/**
 * PURE. Module-scope constants whose value is a complete literal, bound exactly
 * once. Callers treat a hit as fact, so anything shadowed or partly dynamic is
 * left out; that costs only an unknown verdict.
 */
const collectStringConstants = (
    tokens: Token[],
    kinds: readonly TokenKind[] = ['string', 'template'],
): Map<string, string> => {
    const constants = new Map<string, string>();
    const bindingSites = collectBindingSites(tokens);
    for (let index = 0; index + 3 < tokens.length; index += 1) {
        const terminator = tokens[index + 4];
        if (
            tokens[index].kind === 'identifier' &&
            tokens[index].value === 'const' &&
            tokens[index].depth === 0 &&
            tokens[index + 1].kind === 'identifier' &&
            bindingSites.get(tokens[index + 1].value)?.size === 1 &&
            tokens[index + 2].kind === 'operator' &&
            tokens[index + 2].value === '=' &&
            kinds.includes(tokens[index + 3].kind) &&
            (terminator === undefined ||
                (terminator.kind === 'punctuation' &&
                    [';', ','].includes(terminator.value)))
        ) {
            constants.set(tokens[index + 1].value, tokens[index + 3].value);
        }
    }
    return constants;
};

const findMatching = (
    tokens: Token[],
    openingIndex: number,
    opening: OpeningDelimiter,
    closing: ClosingDelimiter,
): number | null => {
    let depth = 0;
    for (let index = openingIndex; index < tokens.length; index += 1) {
        if (
            tokens[index].kind === 'punctuation' &&
            tokens[index].value === opening
        ) {
            depth += 1;
        }
        if (
            tokens[index].kind === 'punctuation' &&
            tokens[index].value === closing
        ) {
            depth -= 1;
        }
        if (depth === 0) return index;
    }
    return null;
};

const BINDING_KEYWORDS = ['const', 'let', 'var', 'function', 'class', 'catch'];

const CLOSING_FOR: Record<OpeningDelimiter, ClosingDelimiter> = {
    '(': ')',
    '[': ']',
    '{': '}',
};

/**
 * PURE. Every token index that binds a name, keyed by name. Indices not counts,
 * because one declaration is reached by several of the rules below.
 */
const collectBindingSites = (tokens: Token[]): Map<string, Set<number>> => {
    const sites = new Map<string, Set<number>>();
    const bind = (name: string, index: number): void => {
        const seen = sites.get(name) ?? new Set<number>();
        seen.add(index);
        sites.set(name, seen);
    };
    const closingIndexOf = (openerIndex: number): number | null => {
        const opening = tokens[openerIndex]?.value as OpeningDelimiter;
        const closing = CLOSING_FOR[opening];
        return closing === undefined
            ? null
            : findMatching(tokens, openerIndex, opening, closing);
    };
    const bindEnclosed = (openerIndex: number): void => {
        const end = closingIndexOf(openerIndex);
        if (end === null) return;
        for (let index = openerIndex + 1; index < end; index += 1) {
            if (tokens[index].kind !== 'identifier') continue;
            // A member name is a property, not a binding.
            if (tokens[index - 1]?.value === '.') continue;
            bind(tokens[index].value, index);
        }
    };

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const next = tokens[index + 1];
        if (next === undefined) continue;

        // An assignment target or a parameter default rebinds the name.
        if (
            token.kind === 'identifier' &&
            next.kind === 'operator' &&
            next.value === '='
        ) {
            bind(token.value, index);
        }

        // An arrow parameter list binds every name it lists.
        if (token.kind === 'punctuation' && token.value === '(') {
            const end = closingIndexOf(index);
            if (end !== null && tokens[end + 1]?.value === '=>') {
                bindEnclosed(index);
            }
        }

        if (token.kind !== 'identifier') continue;
        if (!BINDING_KEYWORDS.includes(token.value)) continue;

        if (next.kind === 'identifier') {
            bind(next.value, index + 1);
            // A function declaration also binds its parameters.
            if (tokens[index + 2]?.value === '(') bindEnclosed(index + 2);
            continue;
        }
        // Destructuring, and a catch or parameter list.
        if (next.kind === 'punctuation' && ['{', '[', '('].includes(next.value)) {
            bindEnclosed(index + 1);
        }
    }
    return sites;
};

const findUpBody = (tokens: Token[]): Token[] | null => {
    const upTokens = tokens
        .map((token, index) => ({ token, index }))
        .filter(
            ({ token }) =>
                token.depth === 0 &&
                token.kind === 'identifier' &&
                token.value === 'up',
        );
    if (upTokens.length !== 1) return null;

    const upIndex = upTokens[0].index;
    const hasFunctionGrammar =
        tokens[upIndex - 1]?.kind === 'identifier' &&
        tokens[upIndex - 1]?.value === 'function';
    const hasConstGrammar =
        tokens[upIndex - 1]?.kind === 'identifier' &&
        tokens[upIndex - 1]?.value === 'const' &&
        tokens.slice(upIndex + 1).some(
            (token) =>
                token.depth === 0 &&
                token.kind === 'operator' &&
                token.value === '=>',
        );
    if (!hasFunctionGrammar && !hasConstGrammar) return null;

    const openingIndex = tokens.findIndex(
        (token, index) =>
            index > upIndex &&
            token.depth === 0 &&
            token.kind === 'punctuation' &&
            token.value === '{',
    );
    if (openingIndex < 0) return null;
    const closingIndex = findMatching(
        tokens,
        openingIndex,
        '{',
        '}',
    );
    return closingIndex === null
        ? null
        : tokens.slice(openingIndex + 1, closingIndex);
};

const resolveTable = (
    token: Token | undefined,
    constants: ReadonlyMap<string, string>,
): string | null => {
    if (!token) return null;
    if (
        token.kind === 'string' ||
        token.kind === 'template'
    ) {
        return token.value;
    }
    if (token.kind === 'identifier') {
        return constants.get(token.value) ?? null;
    }
    return null;
};

const TEMPLATE_PLACEHOLDER = /\$\{([^}]*)\}/g;

/**
 * PURE. The SQL a `knex.raw()` argument stands for, or null when it cannot be
 * read statically. Any `${` surviving substitution means the argument was not
 * understood, so refuse rather than report heaviness the statement never had.
 */
const resolveSqlArgument = (
    token: Token | undefined,
    constants: ReadonlyMap<string, string>,
): string | null => {
    if (!token) return null;
    if (token.kind === 'string' || token.kind === 'template') {
        return token.value;
    }
    if (token.kind !== 'dynamicTemplate') return null;
    let resolved = '';
    let cursor = 0;
    for (const match of token.value.matchAll(TEMPLATE_PLACEHOLDER)) {
        const substitution = constants.get(match[1].trim());
        if (substitution === undefined) return null;
        resolved += token.value.slice(cursor, match.index) + substitution;
        cursor = match.index + match[0].length;
    }
    resolved += token.value.slice(cursor);
    return resolved.includes('${') ? null : resolved;
};

const rawSqlTables = (sql: string): string[] => {
    const tables = new Set<string>();
    const patterns = [
        /\b(?:alter|create|drop|truncate)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?["`]?([a-z_][\w$.]*)["`]?/gi,
        /\b(?:update|insert\s+into|delete\s+from|from|join)\s+(?:only\s+)?["`]?([a-z_][\w$.]*)["`]?/gi,
        /\bcreate\s+(?:unique\s+)?index(?:\s+concurrently)?(?:\s+if\s+not\s+exists)?\s+["`]?[a-z_][\w$]*["`]?\s+on\s+["`]?([a-z_][\w$.]*)["`]?/gi,
    ];
    for (const pattern of patterns) {
        for (const match of sql.matchAll(pattern)) {
            const table = match[1]?.replace(/["`]/g, '').split('.').at(-1);
            if (table) tables.add(table);
        }
    }
    return [...tables];
};

const SQL_COMMENTS = /--[^\n]*|\/\*[\s\S]*?\*\//g;

const sqlStatements = (sql: string): string[] =>
    sql.replace(SQL_COMMENTS, ' ').split(';');

const addsValidatedConstraint = (statement: string): boolean =>
    /\badd\s+constraint\b/i.test(statement) &&
    !/\bnot\s+valid\b/i.test(statement);

export function analyzeMigrationSource(
    migrationPath: string,
    source: string,
): MigrationSourceAnalysis {
    const name = migrationName(migrationPath);
    const edition = migrationEdition(migrationPath);
    const tokenized = tokenize(source);
    const body = findUpBody(tokenized.tokens);
    const constants = collectStringConstants(tokenized.tokens);
    const sqlConstants = collectStringConstants(tokenized.tokens, [
        'string',
        'template',
        'number',
    ]);
    const tables = new Set<string>();
    const heaviness: MigrationHeaviness = {
        locksTable: false,
        rewritesTable: false,
        scansTable: false,
    };
    let complete = tokenized.valid && body !== null;
    const incompleteReasons = new Set<MigrationIncompleteReason>();
    if (!complete) incompleteReasons.add('parse-failure');

    const mark = (...keys: HeavinessKey[]): void => {
        for (const key of keys) heaviness[key] = true;
    };
    const markUnknown = (
        reason: MigrationIncompleteReason,
        ...keys: HeavinessKey[]
    ): void => {
        for (const key of keys) {
            if (heaviness[key] !== true) heaviness[key] = 'unknown';
        }
        complete = false;
        incompleteReasons.add(reason);
    };
    const addTable = (token: Token | undefined): void => {
        const table = resolveTable(token, constants);
        if (table === null) {
            complete = false;
            incompleteReasons.add('unresolved-table-name');
        } else {
            tables.add(table.split('.').at(-1) ?? table);
        }
    };

    if (body === null) {
        Object.assign(heaviness, UNKNOWN_HEAVINESS);
    } else {
        for (let index = 0; index < body.length; index += 1) {
            const token = body[index];
            const previous = body[index - 1];
            const next = body[index + 1];
            const argument = body[index + 2];
            const isMethod =
                previous?.kind === 'punctuation' &&
                previous.value === '.' &&
                next?.kind === 'punctuation' &&
                next.value === '(';

            if (
                token.kind === 'identifier' &&
                ['knex', 'trx'].includes(token.value) &&
                next?.kind === 'punctuation' &&
                next.value === '('
            ) {
                addTable(argument);
            }

            if (!isMethod || token.kind !== 'identifier') continue;

            if (
                [
                    'alterTable',
                    'table',
                    'renameTable',
                    'dropTable',
                    'dropTableIfExists',
                ].includes(token.value)
            ) {
                addTable(argument);
                mark('locksTable');
            } else if (
                ['createTable', 'createTableIfNotExists'].includes(token.value)
            ) {
                addTable(argument);
            } else if (
                [
                    'from',
                    'into',
                    'join',
                    'leftJoin',
                    'rightJoin',
                    'innerJoin',
                    'fullOuterJoin',
                    'inTable',
                ].includes(token.value)
            ) {
                addTable(argument);
            }

            if (['update', 'delete', 'del'].includes(token.value)) {
                mark('rewritesTable', 'scansTable');
            }
            if (token.value === 'truncate') {
                mark('locksTable', 'rewritesTable');
            }
            if (
                [
                    'index',
                    'unique',
                    'primary',
                    'foreign',
                    'dropIndex',
                    'dropUnique',
                    'dropPrimary',
                    'dropForeign',
                ].includes(token.value)
            ) {
                mark('locksTable');
                if (['index', 'unique', 'primary', 'foreign'].includes(token.value)) {
                    mark('scansTable');
                }
            }
            if (
                [
                    'dropColumn',
                    'dropColumns',
                    'renameColumn',
                    'setNullable',
                    'dropNullable',
                    'alter',
                ].includes(token.value)
            ) {
                mark('locksTable');
            }
            if (token.value === 'alter') {
                markUnknown('column-alter', 'rewritesTable');
            }

            if (token.value === 'raw') {
                // The argument is only the whole argument when the call ends
                // or a second one follows; anything else builds it at runtime.
                const argumentEnds = [')', ','].includes(
                    body[index + 3]?.value ?? '',
                );
                const sql = argumentEnds
                    ? resolveSqlArgument(argument, sqlConstants)
                    : null;
                if (sql === null) {
                    markUnknown(
                        'parse-failure',
                        'locksTable',
                        'rewritesTable',
                        'scansTable',
                    );
                    continue;
                }
                for (const table of rawSqlTables(sql)) tables.add(table);
                if (/\b(?:alter|drop|rename|truncate)\s+table\b/i.test(sql)) {
                    mark('locksTable');
                }
                if (/\b(?:update|delete\s+from)\b/i.test(sql)) {
                    mark('rewritesTable', 'scansTable');
                }
                if (/\balter\s+column\b[\s\S]*\btype\b/i.test(sql)) {
                    mark('rewritesTable');
                }
                if (
                    /\b(?:select[\s\S]+from|set\s+not\s+null|validate\s+constraint|create\s+(?:unique\s+)?index)\b/i.test(
                        sql,
                    )
                ) {
                    mark('scansTable');
                }
                // Adding a constraint validates every existing row unless
                // the statement says NOT VALID. Checked per statement so one
                // deferred add cannot vouch for a validated one beside it.
                if (sqlStatements(sql).some(addsValidatedConstraint)) {
                    mark('scansTable');
                }
                if (
                    /\bcreate\s+(?:unique\s+)?index\b/i.test(sql) &&
                    !/\bconcurrently\b/i.test(sql)
                ) {
                    mark('locksTable');
                }
            }
        }
    }

    if (!tokenized.valid) {
        complete = false;
        incompleteReasons.add('parse-failure');
        for (const key of Object.keys(heaviness) as HeavinessKey[]) {
            if (heaviness[key] !== true) heaviness[key] = 'unknown';
        }
    }

    return {
        migration: {
            name,
            edition,
            tables: [...tables].sort(),
            heaviness,
        },
        complete,
        incompleteReasons: [...incompleteReasons],
    };
}

const unreadableMigration = (migrationPath: string): MigrationDetail => ({
    name: migrationName(migrationPath),
    edition: migrationEdition(migrationPath),
    tables: [],
    heaviness: { ...UNKNOWN_HEAVINESS },
});

export function readMigrationMetadata(
    options: ReadMigrationMetadataOptions,
): MigrationMetadata {
    const log = options.log ?? (() => undefined);
    const migrations: MigrationDetail[] = [];
    let complete = true;

    for (const migrationPath of [...options.paths].sort()) {
        let source: string;
        try {
            source = execFileSync(
                'git',
                ['show', `${options.ref}:${migrationPath}`],
                {
                    encoding: 'utf-8',
                    maxBuffer: 64 * 1024 * 1024,
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log(`could not read ${options.ref}:${migrationPath}: ${message}`);
            migrations.push(unreadableMigration(migrationPath));
            complete = false;
            continue;
        }

        const analysis = analyzeMigrationSource(migrationPath, source);
        migrations.push(analysis.migration);
        if (!analysis.complete) {
            log(`metadata extraction incomplete for ${options.ref}:${migrationPath}`);
            complete = false;
        }
    }

    return { migrations, complete };
}
