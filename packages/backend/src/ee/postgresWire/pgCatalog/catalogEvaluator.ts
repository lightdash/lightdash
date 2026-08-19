/* eslint-disable @typescript-eslint/no-use-before-define -- expressions, subqueries and FROM items evaluate each other recursively */
import { assertUnreachable } from '@lightdash/common';
import {
    type DataTypeDef,
    type Expr,
    type ExprCall,
    type From,
    type OrderByStatement,
    type SelectedColumn,
    type SelectFromStatement,
    type SelectStatement,
} from 'pgsql-ast-parser';
import { RE2JS } from 're2js';
import { PG_OID } from '../pgTypes';
import { PgWireServerError } from '../PgWireServerError';
import { lookupFunction, SET_RETURNING_FUNCTIONS } from './catalogFunctions';
import {
    assertValueLength,
    MAX_INTERMEDIATE_TUPLES,
    MAX_PATTERN_LENGTH,
    MAX_PATTERN_SUBJECT_LENGTH,
    MAX_STATEMENT_MS,
    MAX_WORK_UNITS,
    tooExpensive,
    unitsForLength,
} from './catalogLimits';
import {
    regclassOid,
    resolveCatalogRelation,
    type CatalogColumn,
    type CatalogContext,
    type CatalogRelation,
    type CatalogValue,
} from './catalogRelations';

/**
 * Evaluates the SELECT statements drivers and GUI tools issue against the
 * system catalog (pg_catalog, information_schema, or no FROM at all) over the
 * in-memory relations from catalogRelations. It is not a general SQL engine:
 * joins, filters, CASE, casts, scalar subselects and row_number() cover the
 * dialect of pgjdbc's DatabaseMetaData, DBeaver's navigator and psql; anything
 * beyond that fails with a clear 0A000.
 */

export type EvaluatorContext = CatalogContext & {
    relations: Map<string, CatalogRelation>;
};

export type EvaluatedRelation = {
    columns: CatalogColumn[];
    rows: CatalogValue[][];
};

/** One relation instance bound in a FROM clause */
type Source = {
    alias: string;
    /** relation name, so `pg_class.relname` resolves even with an alias */
    relationName: string | null;
    columns: CatalogColumn[];
    /** null when a LEFT JOIN found no match */
    values: CatalogValue[] | null;
};

type Tuple = Source[];

type Scope = {
    tuple: Tuple;
    parent: Scope | null;
    /** row_number() results for the current statement, by window call */
    windows: Map<ExprCall, number> | null;
};

const unsupported = (what: string): PgWireServerError =>
    new PgWireServerError(
        `${what} is not supported in catalog queries`,
        '0A000',
    );

// ---------- value helpers ----------

const isNumber = (value: CatalogValue): value is number =>
    typeof value === 'number';

const compareValues = (a: CatalogValue, b: CatalogValue): number => {
    if (a === null || b === null) {
        return 0;
    }
    if (isNumber(a) && isNumber(b)) {
        return a - b;
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') {
        return Number(a) - Number(b);
    }
    // Postgres coerces a literal to the column type: oid > '16383'
    const numericA = isNumber(a) ? a : asFiniteNumber(a);
    const numericB = isNumber(b) ? b : asFiniteNumber(b);
    if (
        (isNumber(a) || isNumber(b)) &&
        numericA !== null &&
        numericB !== null
    ) {
        return numericA - numericB;
    }
    const left = String(a);
    const right = String(b);
    if (left < right) {
        return -1;
    }
    return left > right ? 1 : 0;
};

const asFiniteNumber = (value: CatalogValue): number | null => {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const parseBoolean = (value: CatalogValue): boolean | null => {
    if (value === null) {
        return null;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (isNumber(value)) {
        return value !== 0;
    }
    const text = String(value).trim().toLowerCase();
    if (['t', 'true', 'yes', 'on', '1', 'y'].includes(text)) {
        return true;
    }
    if (['f', 'false', 'no', 'off', '0', 'n'].includes(text)) {
        return false;
    }
    throw new PgWireServerError(
        `invalid input syntax for type boolean: "${value}"`,
        '22P02',
    );
};

const valuesEqual = (a: CatalogValue, b: CatalogValue): boolean | null => {
    if (a === null || b === null) {
        return null;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    if (typeof a === typeof b) {
        return a === b;
    }
    // Postgres coerces the literal: oid = '1259', bool = 't'
    if (typeof a === 'boolean' || typeof b === 'boolean') {
        return parseBoolean(a) === parseBoolean(b);
    }
    return String(a) === String(b);
};

/**
 * Linear-time regex (RE2), so client-supplied patterns cannot hang the event
 * loop; compiled once per statement and charged to the budget, and never run
 * against subjects longer than MAX_PATTERN_SUBJECT_LENGTH.
 */
const compileRegex = (
    evaluator: Evaluator,
    pattern: string,
    caseInsensitive: boolean,
): RE2JS => {
    const key = `${caseInsensitive ? 'i' : 'c'}:${pattern}`;
    const cached = evaluator.regexCache.get(key);
    if (cached) {
        return cached;
    }
    spend(evaluator, pattern.length);
    try {
        const compiled = RE2JS.compile(
            pattern,
            caseInsensitive ? RE2JS.CASE_INSENSITIVE : 0,
        );
        evaluator.regexCache.set(key, compiled);
        return compiled;
    } catch {
        throw new PgWireServerError(
            `invalid regular expression: ${pattern}`,
            '2201B',
        );
    }
};

const assertPatternLength = (pattern: string): string => {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        throw new PgWireServerError('regular expression is too long', '2201B');
    }
    return pattern;
};

/** RE2 matching is linear in subject × pattern; charge it that way so the budget and clock see it */
const matchSubject = (
    evaluator: Evaluator,
    value: CatalogValue,
    pattern: string,
): string => {
    const subject = String(value);
    if (subject.length > MAX_PATTERN_SUBJECT_LENGTH) {
        throw tooExpensive(
            'matches a pattern against a value that is too long',
        );
    }
    spend(evaluator, 1 + (subject.length * pattern.length) / 256);
    return subject;
};

const REGEX_META = /[.*+?^${}()|[\]\\]/;

/** LIKE pattern -> anchored regex; `\\` escapes the next character as in Postgres */
const likeToRegex = (
    evaluator: Evaluator,
    pattern: string,
    caseInsensitive: boolean,
): RE2JS => {
    assertPatternLength(pattern);
    const parts: string[] = [];
    for (let i = 0; i < pattern.length; i += 1) {
        const char = pattern[i];
        if (char === '\\') {
            if (i + 1 >= pattern.length) {
                throw new PgWireServerError(
                    'LIKE pattern must not end with escape character',
                    '22025',
                );
            }
            i += 1;
            parts.push(
                REGEX_META.test(pattern[i]) ? `\\${pattern[i]}` : pattern[i],
            );
        } else if (char === '%') {
            parts.push('.*');
        } else if (char === '_') {
            parts.push('.');
        } else {
            parts.push(REGEX_META.test(char) ? `\\${char}` : char);
        }
    }
    return compileRegex(evaluator, `^(?s:${parts.join('')})$`, caseInsensitive);
};

/** Postgres `.` matches newlines (ARE); RE2's does not unless told */
const posixRegex = (
    evaluator: Evaluator,
    pattern: string,
    caseInsensitive: boolean,
): RE2JS =>
    compileRegex(
        evaluator,
        `(?s)${assertPatternLength(pattern)}`,
        caseInsensitive,
    );

/** Three-valued AND/OR */
const and = (a: boolean | null, b: boolean | null): boolean | null => {
    if (a === false || b === false) {
        return false;
    }
    return a === null || b === null ? null : true;
};

const or = (a: boolean | null, b: boolean | null): boolean | null => {
    if (a === true || b === true) {
        return true;
    }
    return a === null || b === null ? null : false;
};

// ---------- column resolution ----------

const findColumn = (
    source: Source,
    name: string,
): { index: number; column: CatalogColumn } | null => {
    const index = source.columns.findIndex((c) => c.name === name);
    return index === -1 ? null : { index, column: source.columns[index] };
};

type ResolvedRef = { source: Source; index: number; column: CatalogColumn };

const resolveRef = (
    scope: Scope | null,
    table: string | undefined,
    name: string,
): ResolvedRef => {
    for (let current = scope; current; current = current.parent) {
        const candidates = current.tuple
            .filter(
                (source) =>
                    !table ||
                    source.alias === table ||
                    source.relationName === table,
            )
            .flatMap((source) => {
                const found = findColumn(source, name);
                return found ? [{ source, ...found }] : [];
            });
        if (candidates.length > 1 && !table) {
            throw new PgWireServerError(
                `column reference "${name}" is ambiguous`,
                '42702',
            );
        }
        if (candidates.length === 1) {
            return candidates[0];
        }
    }
    throw new PgWireServerError(
        table
            ? `column ${table}.${name} does not exist`
            : `column "${name}" does not exist`,
        '42703',
    );
};

const readRef = (resolved: ResolvedRef): CatalogValue =>
    resolved.source.values === null
        ? null
        : resolved.source.values[resolved.index];

// ---------- expressions ----------

type Evaluator = {
    context: EvaluatorContext;
    /** remaining work units and the wall-clock deadline for this statement */
    budget: { remaining: number; deadline: number; sinceClock: number };
    regexCache: Map<string, RE2JS>;
};

/** Units between wall-clock checks: cheap enough to run often, rare enough not to matter */
const CLOCK_SAMPLE_UNITS = 2_048;

const spend = (evaluator: Evaluator, units: number): void => {
    const { budget } = evaluator;
    budget.remaining -= units;
    if (budget.remaining < 0) {
        throw tooExpensive('is too expensive');
    }
    budget.sinceClock += units;
    if (budget.sinceClock >= CLOCK_SAMPLE_UNITS) {
        budget.sinceClock = 0;
        if (Date.now() > budget.deadline) {
            throw new PgWireServerError(
                'canceling statement due to statement timeout',
                '57014',
            );
        }
    }
};

/** A string built by the evaluator: bounded in size and charged to the budget */
const built = (evaluator: Evaluator, value: string): string => {
    spend(evaluator, unitsForLength(value.length));
    return assertValueLength(value);
};

const arrayToText = (values: CatalogValue[]): string =>
    `{${values
        .map((v) => {
            if (v === null) {
                return 'NULL';
            }
            const text = Array.isArray(v) ? arrayToText(v) : String(v);
            return /[\s,"\\{}]/.test(text) || text === ''
                ? `"${text.replace(/(["\\])/g, '\\$1')}"`
                : text;
        })
        .join(',')}}`;

const typeNameOf = (to: DataTypeDef): string =>
    to.kind === 'array' ? `${typeNameOf(to.arrayOf)}[]` : to.name.toLowerCase();

const castValue = (
    evaluator: Evaluator,
    value: CatalogValue,
    to: DataTypeDef,
): CatalogValue => {
    const target = typeNameOf(to);
    if (value === null) {
        return null;
    }
    switch (target) {
        case 'regclass':
            return isNumber(value)
                ? value
                : regclassOid(
                      evaluator.context.relations,
                      evaluator.context.catalog,
                      String(value),
                  );
        case 'regproc':
        case 'regprocedure':
            return isNumber(value)
                ? value
                : String(value).replace(/^pg_catalog\./, '');
        case 'regtype': {
            const row = evaluator.context.relations
                .get('pg_catalog.pg_type')
                ?.rows.find((r) => r.typname === String(value));
            return row ? (row.oid as number) : null;
        }
        case 'regnamespace': {
            const row = evaluator.context.relations
                .get('pg_catalog.pg_namespace')
                ?.rows.find((r) => r.nspname === String(value));
            return row ? (row.oid as number) : null;
        }
        case 'text':
        case 'varchar':
        case 'character varying':
        case 'name':
        case 'char':
        case 'bpchar':
        case 'character':
            return Array.isArray(value) ? arrayToText(value) : String(value);
        case 'int':
        case 'integer':
        case 'int2':
        case 'int4':
        case 'int8':
        case 'smallint':
        case 'bigint':
        case 'oid':
        case 'numeric':
        case 'decimal':
        case 'real':
        case 'float':
        case 'float4':
        case 'float8':
        case 'double precision': {
            const number = Number(value);
            if (Number.isNaN(number)) {
                throw new PgWireServerError(
                    `invalid input syntax for type ${target}: "${value}"`,
                    '22P02',
                );
            }
            return number;
        }
        case 'bool':
        case 'boolean':
            return parseBoolean(value);
        default:
            return value;
    }
};

/** Serialize a value in Postgres text format for the wire */
export const toCatalogText = (value: CatalogValue): string | null => {
    if (value === null) {
        return null;
    }
    if (typeof value === 'boolean') {
        return value ? 't' : 'f';
    }
    if (Array.isArray(value)) {
        return arrayToText(value);
    }
    return String(value);
};

const subqueryOf = (expr: Expr): SelectStatement | null => {
    if (
        expr.type === 'select' ||
        expr.type === 'union' ||
        expr.type === 'union all'
    ) {
        return expr;
    }
    return null;
};

function evaluateBinary(
    evaluator: Evaluator,
    op: string,
    left: CatalogValue,
    right: CatalogValue,
    rightExpr: Expr,
    scope: Scope,
): CatalogValue {
    switch (op) {
        case 'AND':
            return and(parseBoolean(left), parseBoolean(right));
        case 'OR':
            return or(parseBoolean(left), parseBoolean(right));
        case '=':
            return valuesEqual(left, right);
        case '!=': {
            const equal = valuesEqual(left, right);
            return equal === null ? null : !equal;
        }
        case '<':
        case '<=':
        case '>':
        case '>=': {
            if (left === null || right === null) {
                return null;
            }
            const comparison = compareValues(left, right);
            if (op === '<') return comparison < 0;
            if (op === '<=') return comparison <= 0;
            if (op === '>') return comparison > 0;
            return comparison >= 0;
        }
        case 'LIKE':
        case 'NOT LIKE':
        case 'ILIKE':
        case 'NOT ILIKE': {
            if (left === null || right === null) {
                return null;
            }
            const matches = likeToRegex(
                evaluator,
                String(right),
                op.includes('ILIKE'),
            )
                .matcher(matchSubject(evaluator, left, String(right)))
                .matches();
            return op.startsWith('NOT') ? !matches : matches;
        }
        case '~':
        case '~*':
        case '!~':
        case '!~*': {
            if (left === null || right === null) {
                return null;
            }
            const matches = posixRegex(
                evaluator,
                String(right),
                op.endsWith('*'),
            )
                .matcher(matchSubject(evaluator, left, String(right)))
                .find();
            return op.startsWith('!') ? !matches : matches;
        }
        case 'IN':
        case 'NOT IN': {
            const listOf = (): CatalogValue[] => {
                if (rightExpr.type === 'list') {
                    return rightExpr.expressions.map((e) =>
                        evaluateExpr(evaluator, e, scope),
                    );
                }
                return Array.isArray(right) ? right : [right];
            };
            const list = listOf();
            if (left === null) {
                return null;
            }
            const found = list.some((item) => valuesEqual(left, item) === true);
            if (!found && list.some((item) => item === null)) {
                return null; // x IN (1, NULL) is unknown, not false
            }
            return op === 'IN' ? found : !found;
        }
        case '||':
            if (left === null || right === null) {
                return null;
            }
            return built(
                evaluator,
                `${toCatalogText(left)}${toCatalogText(right)}`,
            );
        case '+':
        case '-':
        case '*':
        case '/':
        case '%':
        case '&':
        case '|': {
            if (left === null || right === null) {
                return null;
            }
            const a = Number(left);
            const b = Number(right);
            switch (op) {
                case '+':
                    return a + b;
                case '-':
                    return a - b;
                case '*':
                    return a * b;
                case '/':
                    return Number.isInteger(a) && Number.isInteger(b)
                        ? Math.trunc(a / b)
                        : a / b;
                case '%':
                    return a % b;
                case '&':
                    // eslint-disable-next-line no-bitwise
                    return a & b;
                default:
                    // eslint-disable-next-line no-bitwise
                    return a | b;
            }
        }
        default:
            throw unsupported(`operator ${op}`);
    }
}

function evaluateCall(
    evaluator: Evaluator,
    expr: ExprCall,
    scope: Scope,
): CatalogValue {
    if (expr.over) {
        const value = scope.windows?.get(expr);
        if (value === undefined) {
            throw unsupported('window functions outside the select list');
        }
        return value;
    }
    const name = expr.function.name.toLowerCase();
    if (name === 'exists') {
        const subquery = expr.args[0] ? subqueryOf(expr.args[0]) : null;
        if (!subquery) {
            throw unsupported('EXISTS without a subquery');
        }
        return evaluateSelect(evaluator, subquery, scope).rows.length > 0;
    }
    const fn = lookupFunction(name);
    if (!fn) {
        throw new PgWireServerError(
            `function ${expr.function.name}(${expr.args.map(() => 'unknown').join(', ')}) does not exist`,
            '42883',
            'Catalog queries support a fixed set of functions',
        );
    }
    const args = expr.args.map((arg) => evaluateExpr(evaluator, arg, scope));
    return fn.call(args, {
        ...evaluator.context,
        charge: (units) => spend(evaluator, units),
    });
}

function evaluateExpr(
    evaluator: Evaluator,
    expr: Expr,
    scope: Scope,
): CatalogValue {
    switch (expr.type) {
        case 'ref':
            if (expr.name === '*') {
                throw unsupported('* outside the select list');
            }
            return readRef(resolveRef(scope, expr.table?.name, expr.name));
        case 'string':
            return expr.value;
        case 'integer':
        case 'numeric':
            return expr.value;
        case 'boolean':
            return expr.value;
        case 'null':
            return null;
        case 'binary': {
            const left = evaluateExpr(evaluator, expr.left, scope);
            const subquery = subqueryOf(expr.right);
            if ((expr.op === 'IN' || expr.op === 'NOT IN') && subquery) {
                const members = evaluateSelect(
                    evaluator,
                    subquery,
                    scope,
                ).rows.map((row) => row[0] ?? null);
                return evaluateBinary(
                    evaluator,
                    expr.op,
                    left,
                    members,
                    { type: 'null' },
                    scope,
                );
            }
            // IN lists are evaluated lazily by evaluateBinary
            const right =
                expr.right.type === 'list'
                    ? null
                    : evaluateExpr(evaluator, expr.right, scope);
            return evaluateBinary(
                evaluator,
                expr.op,
                left,
                right,
                expr.right,
                scope,
            );
        }
        case 'unary': {
            const operand = evaluateExpr(evaluator, expr.operand, scope);
            const { op } = expr;
            switch (op) {
                case 'NOT': {
                    const value = parseBoolean(operand);
                    return value === null ? null : !value;
                }
                case '-':
                    return operand === null ? null : -Number(operand);
                case '+':
                    return operand;
                case 'IS NULL':
                    return operand === null;
                case 'IS NOT NULL':
                    return operand !== null;
                case 'IS TRUE':
                    return operand === true;
                case 'IS FALSE':
                    return operand === false;
                case 'IS NOT TRUE':
                    return operand !== true;
                case 'IS NOT FALSE':
                    return operand !== false;
                default:
                    return assertUnreachable(
                        op,
                        `unknown unary operator ${op}`,
                    );
            }
        }
        case 'call':
            return evaluateCall(evaluator, expr, scope);
        case 'case': {
            if (expr.value) {
                const subject = evaluateExpr(evaluator, expr.value, scope);
                for (const when of expr.whens) {
                    if (
                        valuesEqual(
                            subject,
                            evaluateExpr(evaluator, when.when, scope),
                        )
                    ) {
                        return evaluateExpr(evaluator, when.value, scope);
                    }
                }
            } else {
                for (const when of expr.whens) {
                    if (
                        parseBoolean(
                            evaluateExpr(evaluator, when.when, scope),
                        ) === true
                    ) {
                        return evaluateExpr(evaluator, when.value, scope);
                    }
                }
            }
            return expr.else ? evaluateExpr(evaluator, expr.else, scope) : null;
        }
        case 'cast':
            return castValue(
                evaluator,
                evaluateExpr(evaluator, expr.operand, scope),
                expr.to,
            );
        case 'arrayIndex': {
            const array = evaluateExpr(evaluator, expr.array, scope);
            const index = evaluateExpr(evaluator, expr.index, scope);
            if (!Array.isArray(array) || index === null) {
                return null;
            }
            return array[Number(index) - 1] ?? null;
        }
        case 'ternary': {
            const value = evaluateExpr(evaluator, expr.value, scope);
            const lo = evaluateExpr(evaluator, expr.lo, scope);
            const hi = evaluateExpr(evaluator, expr.hi, scope);
            if (value === null || lo === null || hi === null) {
                return null;
            }
            const between =
                compareValues(value, lo) >= 0 && compareValues(value, hi) <= 0;
            return expr.op === 'BETWEEN' ? between : !between;
        }
        case 'keyword':
            switch (expr.keyword) {
                case 'current_catalog':
                    return evaluator.context.databaseName;
                case 'current_schema':
                    return 'public';
                case 'current_user':
                case 'session_user':
                case 'user':
                case 'current_role':
                    return evaluator.context.userName;
                case 'current_date':
                    return new Date().toISOString().slice(0, 10);
                case 'current_timestamp':
                case 'localtimestamp':
                    return new Date()
                        .toISOString()
                        .replace('T', ' ')
                        .replace('Z', '+00');
                default:
                    throw unsupported(`keyword ${expr.keyword}`);
            }
        case 'list':
        case 'array':
            return expr.expressions.map((e) =>
                evaluateExpr(evaluator, e, scope),
            );
        case 'select':
        case 'union':
        case 'union all': {
            const result = evaluateSelect(evaluator, expr, scope);
            if (result.columns.length !== 1) {
                throw new PgWireServerError(
                    'subquery must return only one column',
                    '42601',
                );
            }
            if (result.rows.length > 1) {
                throw new PgWireServerError(
                    'more than one row returned by a subquery used as an expression',
                    '21000',
                );
            }
            return result.rows[0]?.[0] ?? null;
        }
        case 'array select':
            return evaluateSelect(evaluator, expr.select, scope).rows.map(
                (row) => row[0] ?? null,
            );
        case 'parameter':
            throw new PgWireServerError(
                `there is no parameter ${expr.name}`,
                '42P02',
            );
        case 'member':
        case 'extract':
        case 'overlay':
        case 'substring':
        case 'with':
        case 'constant':
        case 'default':
        case 'with recursive':
        case 'values':
            throw unsupported(`expression ${expr.type}`);
        default:
            return assertUnreachable(
                expr,
                `unknown expression ${(expr as { type: string }).type}`,
            );
    }
}

// ---------- output typing ----------

const inferOid = (
    evaluator: Evaluator,
    expr: Expr,
    scope: Scope | null,
): number => {
    switch (expr.type) {
        case 'ref':
            return expr.name === '*'
                ? PG_OID.text
                : resolveRef(scope, expr.table?.name, expr.name).column.oid;
        case 'string':
            return PG_OID.text;
        case 'integer':
            return PG_OID.int8;
        case 'numeric':
            return PG_OID.float8;
        case 'boolean':
            return PG_OID.bool;
        case 'binary':
            if (['+', '-', '*', '/', '%', '&', '|'].includes(expr.op)) {
                return PG_OID.int8;
            }
            return expr.op === '||' ? PG_OID.text : PG_OID.bool;
        case 'unary':
            return expr.op === '-' || expr.op === '+'
                ? PG_OID.int8
                : PG_OID.bool;
        case 'call': {
            if (expr.over) {
                return PG_OID.int8;
            }
            const name = expr.function.name.toLowerCase();
            if (name === 'exists') {
                return PG_OID.bool;
            }
            return lookupFunction(name)?.oid ?? PG_OID.text;
        }
        case 'case': {
            const branch = [...expr.whens.map((w) => w.value), expr.else].find(
                (e): e is Expr =>
                    e !== null && e !== undefined && e.type !== 'null',
            );
            return branch ? inferOid(evaluator, branch, scope) : PG_OID.text;
        }
        case 'cast': {
            const target = typeNameOf(expr.to);
            if (target === 'regclass') return PG_OID.regclass;
            if (['bool', 'boolean'].includes(target)) return PG_OID.bool;
            if (['int2', 'smallint'].includes(target)) return PG_OID.int2;
            if (['int', 'integer', 'int4'].includes(target)) return PG_OID.int4;
            if (['int8', 'bigint'].includes(target)) return PG_OID.int8;
            if (target === 'oid') return 26;
            if (['float4', 'real'].includes(target)) return PG_OID.float4;
            if (
                ['float8', 'double precision', 'numeric', 'decimal'].includes(
                    target,
                )
            )
                return PG_OID.float8;
            if (target === 'name') return PG_OID.name;
            return PG_OID.text;
        }
        case 'arrayIndex':
            return inferOid(evaluator, expr.array, scope) === PG_OID.nameArray
                ? PG_OID.name
                : PG_OID.text;
        case 'keyword':
            if (expr.keyword === 'current_date') {
                return PG_OID.date;
            }
            if (
                expr.keyword === 'current_timestamp' ||
                expr.keyword === 'localtimestamp'
            ) {
                return PG_OID.timestamp;
            }
            return PG_OID.name;
        case 'select':
        case 'union':
        case 'union all':
            return PG_OID.text;
        default:
            return PG_OID.text;
    }
};

const inferName = (expr: Expr): string => {
    switch (expr.type) {
        case 'ref':
            return expr.name;
        case 'call':
            return expr.function.name;
        case 'keyword':
            return expr.keyword;
        case 'cast':
            return inferName(expr.operand);
        case 'case':
            return 'case';
        case 'boolean':
            return 'bool';
        default:
            return '?column?';
    }
};

// ---------- FROM ----------

const relationFor = (
    evaluator: Evaluator,
    item: From,
    parent: Scope | null,
): {
    alias: string;
    relationName: string | null;
    columns: CatalogColumn[];
    rows: CatalogValue[][];
} => {
    if (item.type === 'table') {
        const relation = resolveCatalogRelation(
            evaluator.context.relations,
            item.name.schema,
            item.name.name,
        );
        if (!relation) {
            throw new PgWireServerError(
                `relation "${item.name.schema ? `${item.name.schema}.` : ''}${item.name.name}" does not exist`,
                '42P01',
            );
        }
        return {
            alias: item.name.alias ?? item.name.name,
            relationName: item.name.name,
            columns: relation.columns,
            rows: relation.rows.map((row) =>
                relation.columns.map((c) => row[c.name] ?? null),
            ),
        };
    }
    if (item.type === 'statement') {
        const result = evaluateSelect(evaluator, item.statement, parent);
        const columns = item.columnNames
            ? result.columns.map((c, i) => ({
                  ...c,
                  name: item.columnNames?.[i]?.name ?? c.name,
              }))
            : result.columns;
        return {
            alias: item.alias,
            relationName: null,
            columns,
            rows: result.rows,
        };
    }
    // set-returning functions: generate_series(a, b) AS s(r), unnest(array) AS u(x), pg_get_keywords()
    const name = item.function.name.toLowerCase();
    if (name === 'pg_get_keywords') {
        return {
            alias: item.alias?.name ?? name,
            relationName: null,
            columns: [
                'word',
                'catcode',
                'barelabel',
                'catdesc',
                'baredesc',
            ].map((column) => ({
                name: column,
                oid: PG_OID.text,
            })),
            rows: [],
        };
    }
    if (!SET_RETURNING_FUNCTIONS.has(name)) {
        throw unsupported(`function ${item.function.name} in FROM`);
    }
    const scope: Scope = { tuple: [], parent, windows: null };
    const values = evaluateCall(evaluator, item, scope);
    const alias = item.alias?.name ?? name;
    const column = item.alias?.columns?.[0]?.name ?? alias;
    const elements = Array.isArray(values) ? values : [values];
    return {
        alias,
        relationName: null,
        columns: [
            {
                name: column,
                oid: name === 'generate_series' ? PG_OID.int4 : PG_OID.text,
            },
        ],
        rows: elements.map((value) => [value]),
    };
};

/** Split a WHERE clause into its top-level AND conjuncts */
const conjunctsOf = (expr: Expr): Expr[] =>
    expr.type === 'binary' && expr.op === 'AND'
        ? [...conjunctsOf(expr.left), ...conjunctsOf(expr.right)]
        : [expr];

/**
 * The table aliases an expression reads, or null when it has unqualified
 * references or subqueries (then it can only run once everything is bound).
 */
const referencedAliases = (
    node: unknown,
    into = new Set<string>(),
): Set<string> | null => {
    if (Array.isArray(node)) {
        return node.every((child) => referencedAliases(child, into) !== null)
            ? into
            : null;
    }
    if (!node || typeof node !== 'object') {
        return into;
    }
    const expr = node as { type?: string; table?: { name: string } };
    if (expr.type === 'ref') {
        if (!expr.table) {
            return null;
        }
        into.add(expr.table.name);
        return into;
    }
    if (
        expr.type === 'select' ||
        expr.type === 'union' ||
        expr.type === 'union all'
    ) {
        return null;
    }
    return Object.entries(expr)
        .filter(([key]) => key !== '_location')
        .every(([, child]) => referencedAliases(child, into) !== null)
        ? into
        : null;
};

const distinctRows = (
    evaluator: Evaluator,
    rows: CatalogValue[][],
): CatalogValue[][] => {
    const seen = new Set<string>();
    return rows.filter((row) => {
        const key = JSON.stringify(row);
        spend(evaluator, unitsForLength(key.length));
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

type BoundRelation = ReturnType<typeof relationFor>;

const hashKeyOf = (
    evaluator: Evaluator,
    value: CatalogValue,
): string | null => {
    if (value === null) {
        return null;
    }
    if (typeof value === 'boolean') {
        return value ? 't' : 'f';
    }
    const key = Array.isArray(value) ? JSON.stringify(value) : String(value);
    spend(evaluator, unitsForLength(key.length));
    return key;
};

const isSubset = (set: Set<string>, of: Set<string>): boolean =>
    set.size > 0 && [...set].every((name) => of.has(name));

type HashJoin = { leftExpr: Expr; rightExpr: Expr; predicate: Expr };

/**
 * An equality predicate `bound = right` (either side) lets the join probe a
 * hash index on the new relation instead of scanning every row per tuple.
 */
const pickHashJoin = (
    predicates: Expr[],
    boundNames: Set<string>,
    rightNames: Set<string>,
): HashJoin | null => {
    for (const predicate of predicates) {
        if (predicate.type === 'binary' && predicate.op === '=') {
            const leftAliases = referencedAliases(predicate.left);
            const rightAliases = referencedAliases(predicate.right);
            if (leftAliases && rightAliases) {
                if (
                    isSubset(leftAliases, boundNames) &&
                    isSubset(rightAliases, rightNames)
                ) {
                    return {
                        leftExpr: predicate.left,
                        rightExpr: predicate.right,
                        predicate,
                    };
                }
                if (
                    isSubset(rightAliases, boundNames) &&
                    isSubset(leftAliases, rightNames)
                ) {
                    return {
                        leftExpr: predicate.right,
                        rightExpr: predicate.left,
                        predicate,
                    };
                }
            }
        }
    }
    return null;
};

/**
 * Join the bound tuples with one more relation. `filters` are the WHERE
 * conjuncts that become evaluable with this relation bound; for INNER and
 * CROSS joins they are applied while joining so intermediate results stay
 * small (a LEFT JOIN keeps them for the final WHERE, as the null-extended rows
 * must be filtered after extension).
 */
const joinTuples = (
    evaluator: Evaluator,
    tuples: Tuple[],
    item: From,
    right: BoundRelation,
    filters: Expr[],
    parent: Scope | null,
): Tuple[] => {
    const joinType = item.join?.type ?? 'CROSS JOIN';
    if (joinType === 'RIGHT JOIN' || joinType === 'FULL JOIN') {
        throw unsupported(joinType);
    }
    const using = (item.join?.using ?? []).map((n) => n.name);
    const hidden = new Set(using);
    using.forEach((column) => {
        if (!right.columns.some((c) => c.name === column)) {
            throw new PgWireServerError(
                `column "${column}" specified in USING clause does not exist in right table`,
                '42703',
            );
        }
    });
    // after USING the right side's copies of the columns are hidden, as in Postgres
    const bindRight = (values: CatalogValue[] | null): Source => ({
        alias: right.alias,
        relationName: right.relationName,
        columns: right.columns.filter((c) => !hidden.has(c.name)),
        values:
            values === null
                ? null
                : values.filter((_, i) => !hidden.has(right.columns[i].name)),
    });
    const scopeOf = (tuple: Tuple): Scope => ({ tuple, parent, windows: null });
    const holds = (predicate: Expr, tuple: Tuple): boolean =>
        parseBoolean(evaluateExpr(evaluator, predicate, scopeOf(tuple))) ===
        true;

    const predicates = [
        ...(item.join?.on ? conjunctsOf(item.join.on) : []),
        ...(joinType === 'LEFT JOIN' ? [] : filters),
    ];
    const rightNames = new Set([
        right.alias,
        right.relationName ?? right.alias,
    ]);
    const boundNames = new Set(
        (tuples[0] ?? []).flatMap((source) => [
            source.alias,
            source.relationName ?? source.alias,
        ]),
    );
    const hashJoin = pickHashJoin(predicates, boundNames, rightNames);
    const remaining = predicates.filter((p) => p !== hashJoin?.predicate);

    const rightRows = right.rows.map((values) => ({
        values,
        source: bindRight(values),
    }));
    const index = new Map<string, typeof rightRows>();
    if (hashJoin) {
        rightRows.forEach((row) => {
            const key = hashKeyOf(
                evaluator,
                evaluateExpr(
                    evaluator,
                    hashJoin.rightExpr,
                    scopeOf([row.source]),
                ),
            );
            if (key !== null) {
                const bucket = index.get(key);
                if (bucket) {
                    bucket.push(row);
                } else {
                    index.set(key, [row]);
                }
            }
        });
    }
    const usingMatches = (tuple: Tuple, values: CatalogValue[]): boolean =>
        using.every((column) => {
            const left = readRef(resolveRef(scopeOf(tuple), undefined, column));
            const position = right.columns.findIndex((c) => c.name === column);
            return valuesEqual(left, values[position]) === true;
        });

    // a plain cross product costs tuples × rows before any predicate can prune it
    if (!hashJoin) {
        spend(evaluator, tuples.length * rightRows.length);
    }
    const joined: Tuple[] = [];
    for (const tuple of tuples) {
        const candidates = hashJoin
            ? bucketFor(
                  index,
                  hashKeyOf(
                      evaluator,
                      evaluateExpr(
                          evaluator,
                          hashJoin.leftExpr,
                          scopeOf(tuple),
                      ),
                  ),
              )
            : rightRows;
        spend(evaluator, candidates.length);
        let matched = false;
        for (const row of candidates) {
            if (using.length === 0 || usingMatches(tuple, row.values)) {
                const candidate = [...tuple, row.source];
                if (
                    remaining.every((predicate) => holds(predicate, candidate))
                ) {
                    joined.push(candidate);
                    matched = true;
                    if (joined.length > MAX_INTERMEDIATE_TUPLES) {
                        throw tooManyRows();
                    }
                }
            }
        }
        if (!matched && joinType === 'LEFT JOIN') {
            joined.push([...tuple, bindRight(null)]);
        }
    }
    return joined;
};

const bucketFor = <T>(index: Map<string, T[]>, key: string | null): T[] =>
    key === null ? [] : (index.get(key) ?? []);

const tooManyRows = (): PgWireServerError =>
    tooExpensive('joins too many rows');

/**
 * Bind FROM items left to right, handing each join the WHERE conjuncts that
 * become evaluable with it, so cross products stay small.
 */
const resolveFrom = (
    evaluator: Evaluator,
    from: From[] | null | undefined,
    where: Expr | null | undefined,
    parent: Scope | null,
): Tuple[] => {
    if (!from || from.length === 0) {
        return [[]];
    }
    const pending = new Set(where ? conjunctsOf(where) : []);
    const bound = new Set<string>();
    const relations = from.map((item) => relationFor(evaluator, item, parent));
    // an inner join with an empty relation is empty whatever the order; skip the work
    if (
        relations.some(
            (right, i) =>
                right.rows.length === 0 && from[i].join?.type !== 'LEFT JOIN',
        )
    ) {
        return [];
    }
    return from.reduce<Tuple[]>(
        (tuples, item, i) => {
            const right = relations[i];
            bound.add(right.alias);
            bound.add(right.relationName ?? right.alias);
            const filters = [...pending].filter((conjunct) => {
                const aliases = referencedAliases(conjunct);
                return aliases !== null && isSubset(aliases, bound);
            });
            if (item.join?.type !== 'LEFT JOIN') {
                filters.forEach((c) => pending.delete(c));
            }
            return joinTuples(evaluator, tuples, item, right, filters, parent);
        },
        [[]],
    );
};

// ---------- SELECT ----------

const collectWindowCalls = (expr: Expr, into: ExprCall[]): void => {
    switch (expr.type) {
        case 'call':
            if (expr.over) {
                into.push(expr);
            }
            expr.args.forEach((arg) => collectWindowCalls(arg, into));
            return;
        case 'binary':
            collectWindowCalls(expr.left, into);
            collectWindowCalls(expr.right, into);
            return;
        case 'unary':
            collectWindowCalls(expr.operand, into);
            return;
        case 'cast':
            collectWindowCalls(expr.operand, into);
            return;
        case 'case':
            expr.whens.forEach((w) => {
                collectWindowCalls(w.when, into);
                collectWindowCalls(w.value, into);
            });
            if (expr.else) collectWindowCalls(expr.else, into);
            return;
        case 'ternary':
            collectWindowCalls(expr.value, into);
            collectWindowCalls(expr.lo, into);
            collectWindowCalls(expr.hi, into);
            return;
        case 'arrayIndex':
            collectWindowCalls(expr.array, into);
            collectWindowCalls(expr.index, into);
            return;
        case 'list':
        case 'array':
            expr.expressions.forEach((e) => collectWindowCalls(e, into));
            return;
        default:
    }
};

const sortTuples = <T>(
    evaluator: Evaluator,
    items: T[],
    orderBy: OrderByStatement[],
    scopeOf: (item: T) => Scope,
    valueOf?: (item: T, order: OrderByStatement) => CatalogValue | undefined,
): T[] => {
    if (orderBy.length === 0) {
        return items;
    }
    const keyed = items.map((item) => ({
        item,
        keys: orderBy.map((order) => {
            const provided = valueOf?.(item, order);
            const key =
                provided === undefined
                    ? evaluateExpr(evaluator, order.by, scopeOf(item))
                    : provided;
            if (typeof key === 'string') {
                spend(evaluator, unitsForLength(key.length));
            }
            return key;
        }),
    }));
    keyed.sort((a, b) => {
        for (let i = 0; i < orderBy.length; i += 1) {
            const order = orderBy[i];
            const direction = order.order === 'DESC' ? -1 : 1;
            const left = a.keys[i];
            const right = b.keys[i];
            if (left === null || right === null) {
                if (left === right) continue; // eslint-disable-line no-continue
                // Postgres: NULLS LAST for ASC, NULLS FIRST for DESC unless told otherwise
                const nullsFirst = order.nulls
                    ? order.nulls === 'FIRST'
                    : order.order === 'DESC';
                return (left === null ? -1 : 1) * (nullsFirst ? 1 : -1);
            }
            const comparison = compareValues(left, right) * direction;
            if (comparison !== 0) {
                return comparison;
            }
        }
        return 0;
    });
    return keyed.map((k) => k.item);
};

/** Assign row_number() values for each window call in the select list */
const computeWindows = (
    evaluator: Evaluator,
    tuples: Tuple[],
    columns: SelectedColumn[],
    parent: Scope | null,
): Map<Tuple, Map<ExprCall, number>> => {
    const calls: ExprCall[] = [];
    columns.forEach((column) => collectWindowCalls(column.expr, calls));
    const result = new Map<Tuple, Map<ExprCall, number>>(
        tuples.map((tuple) => [tuple, new Map()]),
    );
    for (const call of calls) {
        if (call.function.name.toLowerCase() !== 'row_number') {
            throw unsupported(`window function ${call.function.name}`);
        }
        const scopeOf = (tuple: Tuple): Scope => ({
            tuple,
            parent,
            windows: null,
        });
        const keyOf = (tuple: Tuple): string => {
            const key = JSON.stringify(
                (call.over?.partitionBy ?? []).map((e) =>
                    evaluateExpr(evaluator, e, scopeOf(tuple)),
                ),
            );
            spend(evaluator, unitsForLength(key.length));
            return key;
        };
        const partitions = new Map<string, Tuple[]>();
        tuples.forEach((tuple) => {
            const key = keyOf(tuple);
            const partition = partitions.get(key);
            if (partition) {
                partition.push(tuple);
            } else {
                partitions.set(key, [tuple]);
            }
        });
        partitions.forEach((members) => {
            sortTuples(
                evaluator,
                members,
                call.over?.orderBy ?? [],
                scopeOf,
            ).forEach((tuple, index) =>
                result.get(tuple)?.set(call, index + 1),
            );
        });
    }
    return result;
};

const AGGREGATES = new Set([
    'count',
    'max',
    'min',
    'sum',
    'bool_and',
    'bool_or',
    'string_agg',
    'array_agg',
]);

const isAggregate = (expr: Expr): boolean =>
    expr.type === 'call' &&
    !expr.over &&
    AGGREGATES.has(expr.function.name.toLowerCase());

const aggregate = (
    evaluator: Evaluator,
    call: ExprCall,
    tuples: Tuple[],
    parent: Scope | null,
): CatalogValue => {
    const name = call.function.name.toLowerCase();
    const [argument] = call.args;
    if (!argument && name !== 'count') {
        throw new PgWireServerError(
            `function ${call.function.name}() does not exist`,
            '42883',
        );
    }
    const valuesOf = (): CatalogValue[] =>
        tuples
            .map((tuple) =>
                evaluateExpr(evaluator, argument, {
                    tuple,
                    parent,
                    windows: null,
                }),
            )
            .filter((v) => v !== null);
    switch (name) {
        case 'count':
            if (
                call.args.length === 0 ||
                (call.args[0].type === 'ref' && call.args[0].name === '*')
            ) {
                return tuples.length;
            }
            return valuesOf().length;
        case 'max':
            return valuesOf().reduce<CatalogValue>(
                (best, v) =>
                    best === null || compareValues(v, best) > 0 ? v : best,
                null,
            );
        case 'min':
            return valuesOf().reduce<CatalogValue>(
                (best, v) =>
                    best === null || compareValues(v, best) < 0 ? v : best,
                null,
            );
        case 'sum':
            return valuesOf().reduce<number>(
                (total, v) => total + Number(v),
                0,
            );
        case 'bool_and':
            return valuesOf().every((v) => parseBoolean(v) === true);
        case 'bool_or':
            return valuesOf().some((v) => parseBoolean(v) === true);
        case 'string_agg': {
            const separator = call.args[1]
                ? evaluateExpr(evaluator, call.args[1], {
                      tuple: [],
                      parent,
                      windows: null,
                  })
                : '';
            const values = valuesOf();
            return values.length === 0
                ? null
                : built(
                      evaluator,
                      values.map(String).join(String(separator ?? '')),
                  );
        }
        default:
            return valuesOf();
    }
};

type OutputColumn = {
    name: string;
    oid: number;
    expr: Expr | null;
    source?: { tuple: number; index: number };
};

/** Expand the select list against the FROM sources into output columns */
const outputColumns = (
    evaluator: Evaluator,
    columns: SelectedColumn[] | null | undefined,
    sampleTuple: Tuple,
    parent: Scope | null,
): OutputColumn[] =>
    (columns ?? []).flatMap((column): OutputColumn[] => {
        const { expr } = column;
        if (expr.type === 'ref' && expr.name === '*') {
            const sources = expr.table
                ? sampleTuple.filter(
                      (s) =>
                          s.alias === expr.table?.name ||
                          s.relationName === expr.table?.name,
                  )
                : sampleTuple;
            if (expr.table && sources.length === 0) {
                throw new PgWireServerError(
                    `missing FROM-clause entry for table "${expr.table.name}"`,
                    '42P01',
                );
            }
            return sources.flatMap((source) =>
                source.columns.map((c, index) => ({
                    name: c.name,
                    oid: c.oid,
                    expr: null,
                    source: { tuple: sampleTuple.indexOf(source), index },
                })),
            );
        }
        return [
            {
                name: column.alias?.name ?? inferName(expr),
                oid: inferOid(evaluator, expr, {
                    tuple: sampleTuple,
                    parent,
                    windows: null,
                }),
                expr,
            },
        ];
    });

/** A tuple with every FROM source bound to nulls, to derive column shapes without rows */
const shapeTupleFor = (
    evaluator: Evaluator,
    from: From[] | null | undefined,
    parent: Scope | null,
): Tuple =>
    (from ?? []).map((item) => {
        const relation = relationFor(evaluator, item, parent);
        return {
            alias: relation.alias,
            relationName: relation.relationName,
            columns: relation.columns,
            values: null,
        };
    });

function evaluateSelect(
    evaluator: Evaluator,
    statement: SelectStatement,
    parent: Scope | null,
): EvaluatedRelation {
    if (statement.type === 'union' || statement.type === 'union all') {
        const left = evaluateSelect(evaluator, statement.left, parent);
        const right = evaluateSelect(evaluator, statement.right, parent);
        if (left.columns.length !== right.columns.length) {
            throw new PgWireServerError(
                'each UNION query must have the same number of columns',
                '42601',
            );
        }
        const rows = [...left.rows, ...right.rows];
        return {
            columns: left.columns,
            rows:
                statement.type === 'union'
                    ? distinctRows(evaluator, rows)
                    : rows,
        };
    }
    if (statement.type === 'values') {
        const scope: Scope = { tuple: [], parent, windows: null };
        const rows = statement.values.map((row) =>
            row.map((e) => evaluateExpr(evaluator, e, scope)),
        );
        const columns = (statement.values[0] ?? []).map((e, index) => ({
            name: `column${index + 1}`,
            oid: inferOid(evaluator, e, scope),
        }));
        return { columns, rows };
    }
    if (statement.type !== 'select') {
        throw unsupported(statement.type.toUpperCase());
    }
    const select: SelectFromStatement = statement;
    if (select.groupBy?.length || select.having) {
        throw unsupported('GROUP BY');
    }
    const bound = resolveFrom(evaluator, select.from, select.where, parent);
    // work is charged per row for each pass over the rows (filter, project, sort)
    const chargeRows = (rows: number, columns = 1): void =>
        spend(evaluator, rows * columns);
    chargeRows(bound.length);
    const tuples = bound.filter(
        (tuple) =>
            !select.where ||
            parseBoolean(
                evaluateExpr(evaluator, select.where, {
                    tuple,
                    parent,
                    windows: null,
                }),
            ) === true,
    );
    // the column shape must be known even when there are no rows
    const sample = tuples[0] ?? shapeTupleFor(evaluator, select.from, parent);
    const columns = outputColumns(evaluator, select.columns, sample, parent);

    const selectColumns = select.columns ?? [];
    if (selectColumns.some((c) => isAggregate(c.expr))) {
        chargeRows(tuples.length, selectColumns.length);
        const row = selectColumns.map((c) =>
            isAggregate(c.expr)
                ? aggregate(evaluator, c.expr as ExprCall, tuples, parent)
                : evaluateExpr(evaluator, c.expr, {
                      tuple: sample,
                      parent,
                      windows: null,
                  }),
        );
        return {
            columns: columns.map(({ name, oid }) => ({ name, oid })),
            rows: [row],
        };
    }

    const windows = computeWindows(evaluator, tuples, selectColumns, parent);
    chargeRows(tuples.length, columns.length);
    const projected = tuples.map((tuple) => {
        const scope: Scope = {
            tuple,
            parent,
            windows: windows.get(tuple) ?? null,
        };
        const values = columns.map((column) => {
            if (column.expr) {
                return evaluateExpr(evaluator, column.expr, scope);
            }
            const source = tuple[column.source?.tuple ?? 0];
            return source.values === null
                ? null
                : source.values[column.source?.index ?? 0];
        });
        return { tuple, scope, values };
    });

    const distinct =
        select.distinct === 'distinct'
            ? (() => {
                  const seen = new Set<string>();
                  return projected.filter((row) => {
                      const key = JSON.stringify(row.values);
                      spend(evaluator, unitsForLength(key.length));
                      if (seen.has(key)) {
                          return false;
                      }
                      seen.add(key);
                      return true;
                  });
              })()
            : projected;

    if (select.orderBy?.length) {
        chargeRows(distinct.length, select.orderBy.length);
    }
    const ordered = sortTuples(
        evaluator,
        distinct,
        select.orderBy ?? [],
        (row) => row.scope,
        (row, order) => {
            // ORDER BY may name an output column (alias) or its position
            const { by } = order;
            if (by.type === 'integer') {
                return row.values[by.value - 1] ?? null;
            }
            if (by.type === 'ref' && !by.table) {
                const named = columns.findIndex((c) => c.name === by.name);
                if (named !== -1) {
                    return row.values[named];
                }
            }
            return undefined;
        },
    );

    const offset =
        select.limit?.offset?.type === 'integer'
            ? select.limit.offset.value
            : 0;
    const limit =
        select.limit?.limit?.type === 'integer'
            ? select.limit.limit.value
            : undefined;
    const limited = ordered.slice(
        offset,
        limit === undefined ? undefined : offset + limit,
    );

    return {
        columns: columns.map(({ name, oid }) => ({ name, oid })),
        rows: limited.map((row) => row.values),
    };
}

export const evaluateCatalogSelect = (
    context: EvaluatorContext,
    statement: SelectStatement,
): EvaluatedRelation => {
    try {
        return evaluateSelect(
            {
                context,
                budget: {
                    remaining: MAX_WORK_UNITS,
                    deadline: Date.now() + MAX_STATEMENT_MS,
                    sinceClock: 0,
                },
                regexCache: new Map(),
            },
            statement,
            null,
        );
    } catch (e) {
        if (e instanceof RangeError) {
            // V8 string length limit vs. stack exhaustion from deep nesting
            if (e.message.includes('string length')) {
                throw tooExpensive('builds a value that is too large');
            }
            throw new PgWireServerError('statement is too complex', '54001');
        }
        throw e;
    }
};
