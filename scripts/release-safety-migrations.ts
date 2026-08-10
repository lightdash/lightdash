import { execFileSync } from 'child_process';
import { SyntaxKind } from 'typescript/unstable/ast';
import { createScanner } from 'typescript/unstable/ast/scanner';

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
}

export interface ReadMigrationMetadataOptions {
    paths: string[];
    ref: string;
    log?: (message: string) => void;
}

export interface MigrationMetadata {
    migrations: MigrationDetail[];
    complete: boolean;
}

interface Token {
    kind: SyntaxKind;
    text: string;
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

const UNKNOWN_HEAVINESS: MigrationHeaviness = {
    locksTable: 'unknown',
    rewritesTable: 'unknown',
    scansTable: 'unknown',
};

const tokenize = (source: string): TokenizedSource => {
    const scanner = createScanner(true, undefined, source);
    const tokens: Token[] = [];
    const stack: SyntaxKind[] = [];
    let valid = true;

    while (true) {
        const kind = scanner.scan();
        if (kind === SyntaxKind.EndOfFile) break;
        if (kind === SyntaxKind.Unknown || scanner.isUnterminated()) valid = false;

        if (
            kind === SyntaxKind.CloseBraceToken ||
            kind === SyntaxKind.CloseParenToken ||
            kind === SyntaxKind.CloseBracketToken
        ) {
            const expected =
                kind === SyntaxKind.CloseBraceToken
                    ? SyntaxKind.OpenBraceToken
                    : kind === SyntaxKind.CloseParenToken
                      ? SyntaxKind.OpenParenToken
                      : SyntaxKind.OpenBracketToken;
            if (stack.at(-1) === expected) stack.pop();
            else valid = false;
        }

        tokens.push({
            kind,
            text: scanner.getTokenText(),
            value: scanner.getTokenValue(),
            start: scanner.getTokenStart(),
            end: scanner.getTokenEnd(),
            depth: stack.length,
        });

        if (
            kind === SyntaxKind.OpenBraceToken ||
            kind === SyntaxKind.OpenParenToken ||
            kind === SyntaxKind.OpenBracketToken
        ) {
            stack.push(kind);
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

const collectStringConstants = (tokens: Token[]): Map<string, string> => {
    const constants = new Map<string, string>();
    for (let index = 0; index + 3 < tokens.length; index += 1) {
        if (
            tokens[index].kind === SyntaxKind.ConstKeyword &&
            tokens[index + 1].kind === SyntaxKind.Identifier &&
            tokens[index + 2].kind === SyntaxKind.EqualsToken &&
            (tokens[index + 3].kind === SyntaxKind.StringLiteral ||
                tokens[index + 3].kind ===
                    SyntaxKind.NoSubstitutionTemplateLiteral)
        ) {
            constants.set(tokens[index + 1].value, tokens[index + 3].value);
        }
    }
    return constants;
};

const findMatching = (
    tokens: Token[],
    openingIndex: number,
    opening: SyntaxKind,
    closing: SyntaxKind,
): number | null => {
    let depth = 0;
    for (let index = openingIndex; index < tokens.length; index += 1) {
        if (tokens[index].kind === opening) depth += 1;
        if (tokens[index].kind === closing) depth -= 1;
        if (depth === 0) return index;
    }
    return null;
};

const findUpBody = (tokens: Token[]): Token[] | null => {
    const upTokens = tokens
        .map((token, index) => ({ token, index }))
        .filter(
            ({ token }) =>
                token.depth === 0 &&
                token.kind === SyntaxKind.Identifier &&
                token.value === 'up',
        );
    if (upTokens.length !== 1) return null;

    const upIndex = upTokens[0].index;
    const hasFunctionGrammar =
        tokens[upIndex - 1]?.kind === SyntaxKind.FunctionKeyword;
    const hasConstGrammar =
        tokens[upIndex - 1]?.kind === SyntaxKind.ConstKeyword &&
        tokens.slice(upIndex + 1).some(
            (token) =>
                token.depth === 0 &&
                token.kind === SyntaxKind.EqualsGreaterThanToken,
        );
    if (!hasFunctionGrammar && !hasConstGrammar) return null;

    const openingIndex = tokens.findIndex(
        (token, index) =>
            index > upIndex &&
            token.depth === 0 &&
            token.kind === SyntaxKind.OpenBraceToken,
    );
    if (openingIndex < 0) return null;
    const closingIndex = findMatching(
        tokens,
        openingIndex,
        SyntaxKind.OpenBraceToken,
        SyntaxKind.CloseBraceToken,
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
        token.kind === SyntaxKind.StringLiteral ||
        token.kind === SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
        return token.value;
    }
    if (token.kind === SyntaxKind.Identifier) {
        return constants.get(token.value) ?? null;
    }
    return null;
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

export function analyzeMigrationSource(
    migrationPath: string,
    source: string,
): MigrationSourceAnalysis {
    const name = migrationName(migrationPath);
    const edition = migrationEdition(migrationPath);
    const tokenized = tokenize(source);
    const body = findUpBody(tokenized.tokens);
    const constants = collectStringConstants(tokenized.tokens);
    const tables = new Set<string>();
    const heaviness: MigrationHeaviness = {
        locksTable: false,
        rewritesTable: false,
        scansTable: false,
    };
    let complete = tokenized.valid && body !== null;

    const mark = (...keys: HeavinessKey[]): void => {
        for (const key of keys) heaviness[key] = true;
    };
    const markUnknown = (...keys: HeavinessKey[]): void => {
        for (const key of keys) {
            if (heaviness[key] !== true) heaviness[key] = 'unknown';
        }
        complete = false;
    };
    const addTable = (token: Token | undefined): void => {
        const table = resolveTable(token, constants);
        if (table === null) {
            complete = false;
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
                previous?.kind === SyntaxKind.DotToken &&
                next?.kind === SyntaxKind.OpenParenToken;

            if (
                token.kind === SyntaxKind.Identifier &&
                ['knex', 'trx'].includes(token.value) &&
                next?.kind === SyntaxKind.OpenParenToken
            ) {
                addTable(argument);
            }

            if (!isMethod || token.kind !== SyntaxKind.Identifier) continue;

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
            if (token.value === 'alter') markUnknown('rewritesTable');

            if (token.value === 'raw') {
                if (
                    argument?.kind !== SyntaxKind.StringLiteral &&
                    argument?.kind !== SyntaxKind.NoSubstitutionTemplateLiteral
                ) {
                    markUnknown('locksTable', 'rewritesTable', 'scansTable');
                    continue;
                }
                const sql = argument.value;
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
