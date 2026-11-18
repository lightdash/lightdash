import { type LightdashModel } from '@lightdash/common';
import { stringToArray } from 'cron-converter';
import { astVisitor, parse } from 'pgsql-ast-parser';
import { isDerivedSqlFrom } from './derivedModel';

const safeIdentifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const windowFunctions = new Set(['row_number', 'rank', 'dense_rank']);
// Immutable built-ins, so a copy holds the same values the warehouse would return.
const pureFunctions = new Set([
    'trim',
    'btrim',
    'ltrim',
    'rtrim',
    'lower',
    'upper',
    'length',
    'coalesce',
    'nullif',
    'greatest',
    'least',
    'abs',
    'round',
]);
const rejectSource = (): never => {
    throw new Error('Unsupported materialization source');
};

export const materializationSourceSql = (sqlFrom: string): string => {
    const source = sqlFrom.trim();
    if (source.startsWith('(') && source.endsWith(')'))
        return source.slice(1, -1);
    if (isDerivedSqlFrom(source)) return source;
    return `SELECT * FROM ${source}`;
};

/** Return a catalog check only when every source relation can be identified before execution. */
export const materializationCatalogCheck = (sqlFrom: string): string | null => {
    const relations = new Set<string>();
    try {
        const [query, ...other] = parse(materializationSourceSql(sqlFrom));
        if (!query || query.type !== 'select' || other.length) return null;
        astVisitor((visitor) => ({
            selection(node) {
                if (node.for || Array.isArray(node.distinct)) rejectSource();
                visitor.super().selection(node);
            },
            from(node) {
                if (node.type !== 'table') return rejectSource();
                const { schema, name } = node.name;
                if (
                    !schema ||
                    !safeIdentifier.test(schema) ||
                    !safeIdentifier.test(name) ||
                    schema.startsWith('pg_') ||
                    schema === 'information_schema'
                )
                    return rejectSource();
                relations.add(`('${schema}', '${name}')`);
                return visitor.super().from(node);
            },
            expr(node) {
                if (!node) return;
                switch (node.type) {
                    case 'ref':
                    case 'integer':
                    case 'numeric':
                    case 'string':
                    case 'boolean':
                    case 'null':
                        break;
                    case 'binary':
                    case 'unary':
                        if (node.opSchema) rejectSource();
                        break;
                    case 'call':
                        if (
                            (node.function.schema &&
                                node.function.schema !== 'pg_catalog') ||
                            node.filter ||
                            node.withinGroup ||
                            node.orderBy ||
                            node.distinct ||
                            (pureFunctions.has(node.function.name)
                                ? node.over
                                : !windowFunctions.has(node.function.name) ||
                                  node.args.length ||
                                  !node.over)
                        )
                            rejectSource();
                        node.over?.partitionBy?.forEach((expr) =>
                            visitor.expr(expr),
                        );
                        node.over?.orderBy?.forEach(({ by }) =>
                            visitor.expr(by),
                        );
                        break;
                    case 'case':
                        break;
                    default:
                        rejectSource();
                }
                visitor.super().expr(node);
            },
        })).statement(query);
    } catch {
        return null;
    }
    if (relations.size === 0) return null;
    return `SELECT count(*) = ${relations.size} AS materialization_allowed
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname, c.relname) IN (${[...relations].join(', ')})
  AND c.relkind = 'r' AND NOT c.relhassubclass AND NOT c.relrowsecurity`;
};

export const materializationModelError = (
    model: LightdashModel,
): string | null => {
    const cron = model.materialize?.refresh?.cron;
    if (cron !== undefined) {
        try {
            stringToArray(cron);
        } catch {
            return 'Materialization refresh requires a valid five-field cron expression.';
        }
    }
    if (model.pre_aggregates !== undefined)
        return 'A materialized model cannot also define pre_aggregates.';
    if (
        model.joins?.length ||
        Object.values(model.explores ?? {}).some(
            (explore) => explore.joins?.length,
        )
    )
        return 'A materialized model cannot join another model.';
    const definition = JSON.stringify(model);
    if (
        /"(?:required_attributes|any_attributes)"\s*:|\$\{(?:ld|lightdash)\.(?:attr|attribute|attributes|user)\./i.test(
            definition,
        )
    )
        return 'Materialized models cannot depend on user attributes.';
    for (const [, name] of definition.matchAll(/\$\{([\w-]+)\.[\w-]+\}/g)) {
        if (name !== model.name && name !== 'TABLE')
            return 'A materialized model cannot reference fields from another model.';
    }
    return null;
};
