import * as fs from 'fs';
import * as path from 'path';
import type { MigrationFact, TableAccess } from './preflight';

export interface MigrationFactDerivation {
    fact: MigrationFact;
    unclassifiedConstructs: string[];
    containsBackfill: boolean;
}

type LiteralValue = string | number | boolean;

interface SourceRange {
    start: number;
    end: number;
}

const ACCESS_ORDER: TableAccess[] = ['read', 'write', 'ddl'];
const LOCK_MODE_BY_ACCESS: Record<TableAccess, string> = {
    read: 'AccessShareLock',
    write: 'RowExclusiveLock',
    ddl: 'AccessExclusiveLock',
};
const SCHEMA_METHODS = [
    'alterTable',
    'createTable',
    'createTableIfNotExists',
    'dropTable',
    'dropTableIfExists',
    'renameTable',
    'table',
];
const WRITE_METHODS = ['update', 'insert', 'delete', 'del'];
const READ_METHODS = [
    'select',
    'first',
    'count',
    'countDistinct',
    'max',
    'min',
    'sum',
    'avg',
];
const JOIN_METHODS = [
    'join',
    'leftJoin',
    'leftOuterJoin',
    'rightJoin',
    'rightOuterJoin',
    'fullOuterJoin',
    'innerJoin',
];
const SQL_IDENTIFIER =
    '(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\\.(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))*';

function scanSource(source: string, maskStrings: boolean): string {
    const characters = source.split('');
    let index = 0;
    while (index < source.length) {
        if (source.startsWith('//', index)) {
            const end = source.indexOf('\n', index + 2);
            const stop = end === -1 ? source.length : end;
            characters.fill(' ', index, stop);
            index = stop;
        } else if (source.startsWith('/*', index)) {
            const end = source.indexOf('*/', index + 2);
            const stop = end === -1 ? source.length : end + 2;
            characters.fill(' ', index, stop);
            index = stop;
        } else {
            const quote = source[index];
            if (quote === "'" || quote === '"' || quote === '`') {
                const start = index;
                index += 1;
                let closed = false;
                while (index < source.length && !closed) {
                    if (source[index] === '\\') {
                        index += 2;
                    } else if (source[index] === quote) {
                        index += 1;
                        closed = true;
                    } else {
                        index += 1;
                    }
                }
                if (maskStrings) characters.fill(' ', start, index);
            } else {
                index += 1;
            }
        }
    }
    return characters.join('');
}

function findMatching(
    source: string,
    start: number,
    open: string,
    close: string,
): number | undefined {
    let depth = 0;
    let index = start;
    while (index < source.length) {
        if (source.startsWith('//', index)) {
            const end = source.indexOf('\n', index + 2);
            index = end === -1 ? source.length : end;
        } else if (source.startsWith('/*', index)) {
            const end = source.indexOf('*/', index + 2);
            index = end === -1 ? source.length : end + 2;
        } else {
            const quote = source[index];
            if (quote === "'" || quote === '"' || quote === '`') {
                index += 1;
                let closed = false;
                while (index < source.length && !closed) {
                    if (source[index] === '\\') {
                        index += 2;
                    } else if (source[index] === quote) {
                        index += 1;
                        closed = true;
                    } else {
                        index += 1;
                    }
                }
            } else {
                if (source[index] === open) depth += 1;
                if (source[index] === close) {
                    depth -= 1;
                    if (depth === 0) return index;
                }
                index += 1;
            }
        }
    }
    return undefined;
}

function splitArguments(argumentsSource: string): string[] {
    const argumentsList: string[] = [];
    let start = 0;
    let index = 0;
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    while (index < argumentsSource.length) {
        const character = argumentsSource[index];
        if (character === "'" || character === '"' || character === '`') {
            index += 1;
            let closed = false;
            while (index < argumentsSource.length && !closed) {
                if (argumentsSource[index] === '\\') {
                    index += 2;
                } else if (argumentsSource[index] === character) {
                    index += 1;
                    closed = true;
                } else {
                    index += 1;
                }
            }
        } else if (pairs[character]) {
            const end = findMatching(
                argumentsSource,
                index,
                character,
                pairs[character],
            );
            index = end === undefined ? argumentsSource.length : end + 1;
        } else {
            if (character === ',') {
                argumentsList.push(argumentsSource.slice(start, index).trim());
                start = index + 1;
            }
            index += 1;
        }
    }
    const last = argumentsSource.slice(start).trim();
    if (last) argumentsList.push(last);
    return argumentsList;
}

function callArguments(
    source: string,
    openParenthesis: number,
): { argumentsList: string[]; end: number } | undefined {
    const end = findMatching(source, openParenthesis, '(', ')');
    if (end === undefined) return undefined;
    return {
        argumentsList: splitArguments(source.slice(openParenthesis + 1, end)),
        end,
    };
}

function buildFunctionMap(source: string): Map<string, SourceRange> {
    const masked = scanSource(source, true);
    const functions = new Map<string, SourceRange>();
    const patterns = [
        /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{=]+)?\{/g,
        /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>\s*\{/g,
    ];
    for (const pattern of patterns) {
        for (const match of masked.matchAll(pattern)) {
            const openBrace = (match.index ?? 0) + match[0].lastIndexOf('{');
            const closeBrace = findMatching(source, openBrace, '{', '}');
            if (closeBrace !== undefined) {
                functions.set(match[1], {
                    start: openBrace + 1,
                    end: closeBrace,
                });
            }
        }
    }
    return functions;
}

function reachableFunctionBodies(source: string): SourceRange[] {
    const functions = buildFunctionMap(source);
    const ranges: SourceRange[] = [];
    const visited = new Set<string>();

    function include(name: string): void {
        if (visited.has(name)) return;
        visited.add(name);
        const range = functions.get(name);
        if (!range) return;
        ranges.push(range);
        const body = scanSource(source.slice(range.start, range.end), true);
        for (const candidate of functions.keys()) {
            if (
                candidate !== name &&
                new RegExp(`\\b${candidate}\\s*\\(`).test(body)
            ) {
                include(candidate);
            }
        }
    }

    include('up');
    return ranges;
}

function buildConstantMap(source: string): Map<string, string> {
    const withoutComments = scanSource(source, false);
    const constants = new Map<string, string>();
    const duplicates = new Set<string>();
    const pattern =
        /\bconst\s+([A-Za-z_$][\w$]*)(?:\s*:[^=;]+)?\s*=\s*([^;]+);/g;
    for (const match of withoutComments.matchAll(pattern)) {
        if (constants.has(match[1])) duplicates.add(match[1]);
        constants.set(match[1], match[2].trim());
    }
    for (const duplicate of duplicates) constants.delete(duplicate);
    return constants;
}

function decodeQuoted(value: string): string | undefined {
    const quote = value[0];
    if ((quote !== "'" && quote !== '"') || value.at(-1) !== quote) {
        return undefined;
    }
    return value
        .slice(1, -1)
        .replace(/\\(['"\\`])/g, '$1')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
}

function unwrapExpression(expression: string): string {
    let value = expression.trim();
    while (/^\([\s\S]*\)$/.test(value)) {
        const end = findMatching(value, 0, '(', ')');
        if (end !== value.length - 1) break;
        value = value.slice(1, -1).trim();
    }
    return value.replace(/\s+as\s+const$/, '').trim();
}

function resolveLiteral(
    expression: string,
    constants: Map<string, string>,
    resolving = new Set<string>(),
): LiteralValue | undefined {
    const value = unwrapExpression(expression);
    const quoted = decodeQuoted(value);
    if (quoted !== undefined) return quoted;
    if (/^\d+$/.test(value)) return Number(value);
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^[A-Za-z_$][\w$]*$/.test(value)) {
        if (resolving.has(value)) return undefined;
        const initializer = constants.get(value);
        if (!initializer) return undefined;
        const nextResolving = new Set(resolving);
        nextResolving.add(value);
        return resolveLiteral(initializer, constants, nextResolving);
    }
    if (value.startsWith('`') && value.endsWith('`') && !value.includes('${')) {
        return value.slice(1, -1);
    }
    return undefined;
}

function renderSql(
    expression: string,
    constants: Map<string, string>,
): string | undefined {
    const value = unwrapExpression(expression);
    const literal = resolveLiteral(value, constants);
    if (literal !== undefined) return String(literal);
    if (!value.startsWith('`') || !value.endsWith('`')) return undefined;
    return value.slice(1, -1).replace(/\$\{([^{}]+)\}/g, (_, inner: string) => {
        const resolved = resolveLiteral(inner, constants);
        return resolved === undefined
            ? '__UNRESOLVED_EXPRESSION__'
            : String(resolved);
    });
}

function formatConstruct(source: string, start: number, end: number): string {
    const prefix = source.slice(0, start);
    const line = prefix.split('\n').length;
    const lineStart = prefix.lastIndexOf('\n') + 1;
    const column = start - lineStart + 1;
    const snippet = source
        .slice(start, end + 1)
        .replace(/\s+/g, ' ')
        .slice(0, 180);
    return `${line}:${column} ${snippet}`;
}

function normalizeSqlIdentifier(identifier: string): string | undefined {
    if (identifier.includes('__UNRESOLVED')) return undefined;
    const normalized = identifier
        .split('.')
        .map((part) => part.replace(/^"|"$/g, ''))
        .join('.');
    return /^[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*$/.test(
        normalized,
    )
        ? normalized
        : undefined;
}

export function isSystemCatalogRelation(identifier: string): boolean {
    const parts = identifier.toLowerCase().split('.');
    const schema = parts.length > 1 ? parts[0] : null;
    const relation = parts.at(-1) ?? '';
    if (schema === 'pg_catalog' || schema === 'information_schema') return true;
    return schema === null && relation.startsWith('pg_');
}

function substituteIdentifiers(
    sql: string,
    bindingsExpression: string | undefined,
    constants: Map<string, string>,
): string {
    if (!bindingsExpression || !sql.includes('??')) return sql;
    const bindingsSource = bindingsExpression.trim();
    const bindings =
        bindingsSource.startsWith('[') && bindingsSource.endsWith(']')
            ? splitArguments(bindingsSource.slice(1, -1))
            : [];
    let bindingIndex = 0;
    return sql.replace(/\?\?|\?/g, (placeholder) => {
        const binding = bindings[bindingIndex];
        bindingIndex += 1;
        if (placeholder === '?') return '?';
        const value = binding ? resolveLiteral(binding, constants) : undefined;
        return typeof value === 'string' ? value : '__UNRESOLVED_IDENTIFIER__';
    });
}

function stripSqlComments(sql: string): string {
    return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function sqlMatches(sql: string, pattern: RegExp): string[] {
    return [...sql.matchAll(pattern)].map((match) => match[1]);
}

function extractCteNames(sql: string): Set<string> {
    const ctes = new Set<string>();
    const pattern = new RegExp(
        `(?:\\bWITH(?:\\s+RECURSIVE)?|,)\\s*(${SQL_IDENTIFIER})(?:\\s*\\([^)]*\\))?\\s+AS\\s*\\(`,
        'gi',
    );
    for (const identifier of sqlMatches(sql, pattern)) {
        const normalized = normalizeSqlIdentifier(identifier);
        if (normalized) ctes.add(normalized);
    }
    return ctes;
}

function batchSizesFromSqlExpression(
    expression: string,
    constants: Map<string, string>,
): number[] {
    const value = unwrapExpression(expression);
    if (!value.startsWith('`') || !value.endsWith('`')) return [];
    const batchSizes: number[] = [];
    for (const match of value.matchAll(
        /\bLIMIT\s+\$\{\s*([A-Za-z_$][\w$]*)\s*\}/gi,
    )) {
        if (/batch/i.test(match[1])) {
            const resolved = resolveLiteral(match[1], constants);
            if (typeof resolved === 'number' && Number.isInteger(resolved)) {
                batchSizes.push(resolved);
            }
        }
    }
    return batchSizes;
}

function findCalls(
    source: string,
    range: SourceRange,
    pattern: RegExp,
): Array<{ match: RegExpExecArray; start: number; openParenthesis: number }> {
    const body = source.slice(range.start, range.end);
    const masked = scanSource(body, true);
    const calls: Array<{
        match: RegExpExecArray;
        start: number;
        openParenthesis: number;
    }> = [];
    const matcher = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(masked)) !== null) {
        const start = range.start + match.index;
        calls.push({
            match,
            start,
            openParenthesis: range.start + matcher.lastIndex - 1,
        });
    }
    return calls;
}

function nearestBuilderCall(
    source: string,
    range: SourceRange,
    methodStart: number,
): { start: number; openParenthesis: number } | undefined {
    const chainStart = Math.max(
        range.start,
        source.lastIndexOf(';', methodStart - 1) + 1,
        source.lastIndexOf('{', methodStart - 1) + 1,
        source.lastIndexOf('}', methodStart - 1) + 1,
    );
    const chain = scanSource(source.slice(chainStart, methodStart), true);
    const patterns = [/\b(?:knex|trx)\s*\(/g, /\.\s*table\s*\(/g];
    let nearest: { start: number; openParenthesis: number } | undefined;
    for (const pattern of patterns) {
        for (const match of chain.matchAll(pattern)) {
            const start = chainStart + (match.index ?? 0);
            if (!nearest || start > nearest.start) {
                nearest = {
                    start,
                    openParenthesis: start + match[0].lastIndexOf('('),
                };
            }
        }
    }
    return nearest;
}

function configDisablesTransactions(source: string): boolean {
    const withoutComments = scanSource(source, false);
    const match = withoutComments.match(
        /\bexport\s+const\s+config\b[^=]*=\s*\{([\s\S]*?)\}/,
    );
    return match ? /\btransaction\s*:\s*false\b/.test(match[1]) : false;
}

export function deriveMigrationFactWithDiagnostics(
    source: string,
    migration: string,
    introducedIn: string,
): MigrationFactDerivation {
    const constants = buildConstantMap(source);
    const accesses = new Map<string, Set<TableAccess>>();
    const unclassifiedConstructs = new Set<string>();
    const batchSizes = new Set<number>();
    const lockTimeouts = new Set<string>();
    let containsBackfill = false;

    function unclassified(start: number, end: number): void {
        unclassifiedConstructs.add(formatConstruct(source, start, end));
    }

    function addAccess(table: string, access: TableAccess): void {
        const normalized = normalizeSqlIdentifier(table);
        if (!normalized || isSystemCatalogRelation(normalized)) return;
        const tableAccesses =
            accesses.get(normalized) ?? new Set<TableAccess>();
        tableAccesses.add(access);
        accesses.set(normalized, tableAccesses);
    }

    function addResolvedTable(
        expression: string | undefined,
        access: TableAccess,
        start: number,
        end: number,
    ): void {
        const value = expression
            ? resolveLiteral(expression, constants)
            : undefined;
        if (typeof value !== 'string') {
            unclassified(start, end);
            return;
        }
        addAccess(value, access);
    }

    function classifySql(
        sqlValue: string,
        constructStart: number,
        constructEnd: number,
    ): void {
        const sql = stripSqlComments(sqlValue);
        const ctes = extractCteNames(sql);
        const patterns: Array<{ access: TableAccess; pattern: RegExp }> = [
            {
                access: 'ddl',
                pattern: new RegExp(
                    `\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${SQL_IDENTIFIER}|__UNRESOLVED_(?:EXPRESSION|IDENTIFIER)__)`,
                    'gi',
                ),
            },
            {
                access: 'ddl',
                pattern: new RegExp(
                    `\\bCREATE\\s+(?:UNIQUE\\s+)?INDEX(?:\\s+CONCURRENTLY)?(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${SQL_IDENTIFIER}\\s+ON\\s+(?:ONLY\\s+)?(${SQL_IDENTIFIER}|__UNRESOLVED_(?:EXPRESSION|IDENTIFIER)__)`,
                    'gi',
                ),
            },
            {
                access: 'ddl',
                pattern: new RegExp(
                    `\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${SQL_IDENTIFIER}|__UNRESOLVED_(?:EXPRESSION|IDENTIFIER)__)`,
                    'gi',
                ),
            },
            {
                access: 'ddl',
                pattern: new RegExp(
                    `\\bDROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${SQL_IDENTIFIER}|__UNRESOLVED_(?:EXPRESSION|IDENTIFIER)__)`,
                    'gi',
                ),
            },
            {
                access: 'write',
                pattern: new RegExp(
                    `\\bUPDATE\\s+(${SQL_IDENTIFIER}|__UNRESOLVED_(?:EXPRESSION|IDENTIFIER)__)`,
                    'gi',
                ),
            },
            {
                access: 'write',
                pattern: new RegExp(
                    `\\bINSERT\\s+INTO\\s+(${SQL_IDENTIFIER}|__UNRESOLVED_(?:EXPRESSION|IDENTIFIER)__)`,
                    'gi',
                ),
            },
            {
                access: 'write',
                pattern: new RegExp(
                    `\\bDELETE\\s+FROM\\s+(${SQL_IDENTIFIER}|__UNRESOLVED_(?:EXPRESSION|IDENTIFIER)__)`,
                    'gi',
                ),
            },
        ];

        for (const { access, pattern } of patterns) {
            for (const identifier of sqlMatches(sql, pattern)) {
                const table = normalizeSqlIdentifier(identifier);
                if (!table) {
                    unclassified(constructStart, constructEnd);
                } else if (!ctes.has(table)) {
                    addAccess(table, access);
                }
            }
        }

        const readPattern = new RegExp(
            `\\b(FROM|JOIN)\\s+(${SQL_IDENTIFIER}|__UNRESOLVED_(?:EXPRESSION|IDENTIFIER)__)`,
            'gi',
        );
        for (const match of sql.matchAll(readPattern)) {
            const keyword = match[1].toUpperCase();
            const identifier = match[2];
            const start = match.index ?? 0;
            const prefix = sql.slice(Math.max(0, start - 24), start);
            const suffix = sql.slice(start + match[0].length);
            const isExpressionContext =
                (keyword === 'FROM' &&
                    /\b(?:DISTINCT|BOTH)\s*$/i.test(prefix)) ||
                /^(?:LATERAL|SELECT|VALUES|UNNEST)$/i.test(identifier) ||
                /^\s*\(/.test(suffix);
            if (!isExpressionContext) {
                const table = normalizeSqlIdentifier(identifier);
                if (!table) {
                    unclassified(constructStart, constructEnd);
                } else if (!ctes.has(table)) {
                    addAccess(table, 'read');
                }
            }
        }

        if (/\bUPDATE\s+/i.test(sql)) containsBackfill = true;
        if (/\bINSERT\s+INTO\b[\s\S]*\bSELECT\b/i.test(sql)) {
            containsBackfill = true;
        }
        for (const match of sql.matchAll(
            /\bSET\s+LOCAL\s+lock_timeout\s*=\s*['"]([^'"]+)['"]/gi,
        )) {
            lockTimeouts.add(match[1]);
        }
        if (/\bDROP\s+(?:INDEX|CONSTRAINT)\b/i.test(sql)) {
            unclassified(constructStart, constructEnd);
        }
    }

    for (const range of reachableFunctionBodies(source)) {
        const schemaPattern = new RegExp(
            `\\.\\s*schema\\s*\\.\\s*(${SCHEMA_METHODS.join('|')})\\s*\\(`,
            'g',
        );
        for (const call of findCalls(source, range, schemaPattern)) {
            const parsed = callArguments(source, call.openParenthesis);
            if (!parsed) {
                unclassified(call.start, call.openParenthesis);
            } else {
                addResolvedTable(
                    parsed.argumentsList[0],
                    'ddl',
                    call.start,
                    parsed.end,
                );
                if (call.match[1] === 'renameTable') {
                    addResolvedTable(
                        parsed.argumentsList[1],
                        'ddl',
                        call.start,
                        parsed.end,
                    );
                }
            }
        }

        const directMethods: Array<{ methods: string[]; access: TableAccess }> =
            [
                { methods: ['from'], access: 'read' },
                { methods: ['into'], access: 'write' },
                { methods: JOIN_METHODS, access: 'read' },
            ];
        for (const { methods, access } of directMethods) {
            const pattern = new RegExp(
                `\\.\\s*(?:${methods.join('|')})\\s*\\(`,
                'g',
            );
            for (const call of findCalls(source, range, pattern)) {
                const parsed = callArguments(source, call.openParenthesis);
                if (!parsed) {
                    unclassified(call.start, call.openParenthesis);
                } else {
                    addResolvedTable(
                        parsed.argumentsList[0],
                        access,
                        call.start,
                        parsed.end,
                    );
                }
            }
        }

        const terminalMethods = WRITE_METHODS;
        const terminalPattern = new RegExp(
            `\\.\\s*(${terminalMethods.join('|')})\\s*\\(`,
            'g',
        );
        for (const call of findCalls(source, range, terminalPattern)) {
            const method = call.match[1];
            const builder = nearestBuilderCall(source, range, call.start);
            if (builder) {
                const builderArguments = callArguments(
                    source,
                    builder.openParenthesis,
                );
                const terminalArguments = callArguments(
                    source,
                    call.openParenthesis,
                );
                if (!builderArguments || !terminalArguments) {
                    unclassified(call.start, call.openParenthesis);
                } else {
                    addResolvedTable(
                        builderArguments.argumentsList[0],
                        'write',
                        builder.start,
                        terminalArguments.end,
                    );
                    if (method === 'update') containsBackfill = true;
                    if (
                        method === 'insert' &&
                        new RegExp(
                            `\\.\\s*(?:${READ_METHODS.join('|')})\\s*\\(`,
                        ).test(
                            scanSource(
                                terminalArguments.argumentsList.join(','),
                                true,
                            ),
                        )
                    ) {
                        containsBackfill = true;
                    }
                }
            }
        }

        for (const call of findCalls(source, range, /\.\s*limit\s*\(/g)) {
            const parsed = callArguments(source, call.openParenthesis);
            const expression = parsed?.argumentsList[0];
            const value = expression
                ? resolveLiteral(expression, constants)
                : undefined;
            if (
                expression &&
                /batch/i.test(unwrapExpression(expression)) &&
                typeof value === 'number' &&
                Number.isInteger(value)
            ) {
                batchSizes.add(value);
            } else if (typeof value !== 'number') {
                unclassified(call.start, parsed?.end ?? call.openParenthesis);
            }
        }

        for (const call of findCalls(
            source,
            range,
            /\.\s*raw(?:\s*<[^;()]*>)?\s*\(/g,
        )) {
            const parsed = callArguments(source, call.openParenthesis);
            if (!parsed || !parsed.argumentsList[0]) {
                unclassified(call.start, parsed?.end ?? call.openParenthesis);
            } else {
                const rendered = renderSql(parsed.argumentsList[0], constants);
                if (rendered === undefined) {
                    unclassified(call.start, parsed.end);
                } else {
                    for (const batchSize of batchSizesFromSqlExpression(
                        parsed.argumentsList[0],
                        constants,
                    )) {
                        batchSizes.add(batchSize);
                    }
                    classifySql(
                        substituteIdentifiers(
                            rendered,
                            parsed.argumentsList[1],
                            constants,
                        ),
                        call.start,
                        parsed.end,
                    );
                }
            }
        }
    }

    if (batchSizes.size > 1) {
        unclassifiedConstructs.add(
            `multiple LIMIT batch sizes: ${[...batchSizes].sort((a, b) => a - b).join(', ')}`,
        );
    }
    if (lockTimeouts.size > 1) {
        unclassifiedConstructs.add(
            `multiple lock timeouts: ${[...lockTimeouts].sort().join(', ')}`,
        );
    }

    const runsInTransaction = !configDisablesTransactions(source);
    const batchSize = batchSizes.size === 1 ? [...batchSizes][0] : null;
    const tables = [...accesses.entries()].map(([name, accessSet]) => {
        if (accessSet.has('write')) accessSet.delete('read');
        const access = ACCESS_ORDER.filter((candidate) =>
            accessSet.has(candidate),
        );
        return {
            name,
            access,
            expectedLockModes: access.map(
                (candidate) => LOCK_MODE_BY_ACCESS[candidate],
            ),
        };
    });

    return {
        fact: {
            migration,
            introducedIn,
            runsInTransaction,
            resumable: !runsInTransaction && batchSize !== null,
            batchSize,
            lockTimeout: lockTimeouts.size === 1 ? [...lockTimeouts][0] : null,
            tables,
            backfill: null,
            notes: null,
        },
        unclassifiedConstructs: [...unclassifiedConstructs],
        containsBackfill,
    };
}

/** Resumable is a heuristic: non-transactional migrations with a bounded LIMIT are treated as resumable. */
export function deriveMigrationFact(
    source: string,
    migration: string,
    introducedIn: string,
): MigrationFact {
    return deriveMigrationFactWithDiagnostics(source, migration, introducedIn)
        .fact;
}

export function migrationContainsBackfill(source: string): boolean {
    return deriveMigrationFactWithDiagnostics(source, 'migration', 'unknown')
        .containsBackfill;
}

function cliArguments(args: string[]): {
    directory: string;
    introducedIn: string;
    summaryOnly: boolean;
} {
    let directory = 'packages/backend/src/database/migrations';
    let introducedIn: string | undefined;
    let summaryOnly = false;
    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '--directory') {
            directory = args[index + 1] ?? '';
            index += 1;
        } else if (args[index] === '--introduced-in') {
            introducedIn = args[index + 1];
            index += 1;
        } else if (args[index] === '--summary') {
            summaryOnly = true;
        } else {
            throw new Error(`unknown argument: ${args[index]}`);
        }
    }
    if (!introducedIn) {
        throw new Error('--introduced-in is required and is never inferred');
    }
    return { directory, introducedIn, summaryOnly };
}

function runCli(): void {
    const { directory, introducedIn, summaryOnly } = cliArguments(
        process.argv.slice(2),
    );
    const files = fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) => entry.name)
        .sort();
    const derivations = files.map((file) => {
        const migration = path.basename(file, path.extname(file));
        const source = fs.readFileSync(path.join(directory, file), 'utf8');
        return deriveMigrationFactWithDiagnostics(
            source,
            migration,
            introducedIn,
        );
    });
    const summary = {
        factsProduced: derivations.length,
        tablesClassified: derivations.reduce(
            (total, derivation) => total + derivation.fact.tables.length,
            0,
        ),
        constructsUnclassified: derivations.reduce(
            (total, derivation) =>
                total + derivation.unclassifiedConstructs.length,
            0,
        ),
        backfillsDetected: derivations.filter(
            (derivation) => derivation.containsBackfill,
        ).length,
    };
    console.log(
        JSON.stringify(
            summaryOnly
                ? summary
                : {
                      facts: derivations.map((derivation) => derivation.fact),
                      unclassifiedConstructs: derivations.flatMap(
                          (derivation) =>
                              derivation.unclassifiedConstructs.map(
                                  (construct) => ({
                                      migration: derivation.fact.migration,
                                      construct,
                                  }),
                              ),
                      ),
                      summary,
                  },
            null,
            2,
        ),
    );
}

if (process.argv[1]?.endsWith('derive-migration-facts.ts')) {
    try {
        runCli();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
