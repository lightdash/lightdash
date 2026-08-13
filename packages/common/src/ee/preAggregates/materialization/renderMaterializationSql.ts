import { ExploreCompiler } from '../../../compiler/exploreCompiler';
import {
    DEFAULT_FILTER_CASE_SENSITIVE,
    renderFilterRuleSqlFromField,
} from '../../../compiler/filtersCompiler';
import { getReservedParameterNames } from '../../../parameters/reservedParameters';
import { ParameterError } from '../../../types/errors';
import type { Explore } from '../../../types/explore';
import {
    type CompiledDimension,
    type CompiledMetric,
    type FieldId,
    type MetricType,
} from '../../../types/field';
import type { AdditionalMetric } from '../../../types/metricQuery';
import type {
    MaterializationMetricQueryPayload,
    PreAggregateDef,
} from '../../../types/preAggregate';
import type { TimeFrames } from '../../../types/timeFrames';
import type { WarehouseSqlBuilder } from '../../../types/warehouse';
import { convertAdditionalMetric } from '../../../utils/additionalMetrics';
import assertUnreachable from '../../../utils/assertUnreachable';
import { getDimensionMapFromTables } from '../../../utils/fields';
import { getFilterRulesFromGroup } from '../../../utils/filters';
import { getItemId } from '../../../utils/item';
import { buildMaterializationMetricQuery } from './buildMaterializationMetricQuery';

export enum MaterializationColumnRole {
    DIMENSION = 'dimension',
    TIME_DIMENSION = 'time_dimension',
    METRIC = 'metric',
    METRIC_COMPONENT = 'metric_component',
}

export type MaterializationColumn = {
    name: string;
    role: MaterializationColumnRole;
    granularity: TimeFrames | null;
    aggregation: MetricType | null;
    parentMetricFieldId: FieldId | null;
};

export type MaterializationSql = {
    sql: string;
    columns: MaterializationColumn[];
    payload: MaterializationMetricQueryPayload;
};

const USER_ATTRIBUTE_PATTERN = /\$\{(?:lightdash|ld)\./;

const getJoinType = (type: 'inner' | 'full' | 'left' | 'right' = 'left') => {
    switch (type) {
        case 'inner':
            return 'INNER JOIN';
        case 'full':
            return 'FULL OUTER JOIN';
        case 'left':
            return 'LEFT OUTER JOIN';
        case 'right':
            return 'RIGHT OUTER JOIN';
        default:
            return assertUnreachable(type, `Unknown join type: ${type}`);
    }
};

/**
 * Renders the materialization SELECT for a pre-aggregate — the same query the
 * managed materialization pipeline runs, minus ORDER BY / LIMIT (irrelevant to
 * the stored result). Includes the base table's sql_filter; definitions whose
 * SQL references user attributes or parameters are rejected rather than
 * silently rendered differently, as those only resolve on the server.
 * Required model filters are excluded on the server too
 * (skipModelRequiredFilters) — omitting them here is parity, not a gap.
 */
export const renderMaterializationSql = ({
    sourceExplore,
    preAggregateDef,
    warehouseSqlBuilder,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}): MaterializationSql => {
    const payload = buildMaterializationMetricQuery({
        sourceExplore,
        preAggregateDef,
        materializationConfig: { maxRows: null },
    });
    const { metricQuery, metricComponents, timeDimensionFieldId } = payload;
    const q = warehouseSqlBuilder.getFieldQuoteChar();
    const availableParameters = [
        ...Object.keys(sourceExplore.parameters ?? {}),
        ...getReservedParameterNames(),
    ];

    const dimensionsByFieldId = getDimensionMapFromTables(sourceExplore.tables);
    const getDimension = (fieldId: FieldId): CompiledDimension => {
        const dimension = dimensionsByFieldId[fieldId];
        if (!dimension) {
            throw new ParameterError(
                `Pre-aggregate "${preAggregateDef.name}" references unknown dimension field ID "${fieldId}"`,
            );
        }
        return dimension;
    };

    const metricsByFieldId = Object.values(sourceExplore.tables).reduce<
        Record<FieldId, CompiledMetric>
    >((acc, table) => {
        Object.values(table.metrics).forEach((metric) => {
            acc[getItemId(metric)] = metric;
        });
        return acc;
    }, {});

    const exploreCompiler = new ExploreCompiler(warehouseSqlBuilder);
    const compileAdditionalMetric = (
        additionalMetric: AdditionalMetric,
    ): { compiledSql: string; tablesReferences: string[] } => {
        const table = sourceExplore.tables[additionalMetric.table];
        if (table === undefined) {
            throw new ParameterError(
                `Pre-aggregate metric "${additionalMetric.name}" references a table that doesn't exist "${additionalMetric.table}"`,
            );
        }
        const metric = convertAdditionalMetric({ additionalMetric, table });
        const compiled = exploreCompiler.compileMetricSql(
            metric,
            sourceExplore.tables,
            availableParameters,
        );
        return {
            compiledSql: compiled.sql,
            tablesReferences: Array.from(compiled.tablesReferences),
        };
    };

    const additionalMetricsByFieldId = (
        metricQuery.additionalMetrics ?? []
    ).reduce<Record<FieldId, AdditionalMetric>>((acc, additionalMetric) => {
        acc[getItemId(additionalMetric)] = additionalMetric;
        return acc;
    }, {});

    const componentParentByFieldId = Object.entries(metricComponents).reduce<
        Record<FieldId, { parent: FieldId; aggregation: MetricType }>
    >((acc, [parentFieldId, components]) => {
        components.forEach((component) => {
            if (component.componentFieldId !== parentFieldId) {
                acc[component.componentFieldId] = {
                    parent: parentFieldId,
                    aggregation: component.aggregation,
                };
            }
        });
        return acc;
    }, {});

    const referencedTables = new Set<string>([sourceExplore.baseTable]);
    const selects: string[] = [];
    const columns: MaterializationColumn[] = [];

    metricQuery.dimensions.forEach((fieldId) => {
        const dimension = getDimension(fieldId);
        selects.push(`  ${dimension.compiledSql} AS ${q}${fieldId}${q}`);
        (dimension.tablesReferences ?? [dimension.table]).forEach((table) =>
            referencedTables.add(table),
        );
        columns.push({
            name: fieldId,
            role:
                fieldId === timeDimensionFieldId
                    ? MaterializationColumnRole.TIME_DIMENSION
                    : MaterializationColumnRole.DIMENSION,
            granularity:
                fieldId === timeDimensionFieldId
                    ? (preAggregateDef.granularity ?? null)
                    : null,
            aggregation: null,
            parentMetricFieldId: null,
        });
    });

    metricQuery.metrics.forEach((fieldId) => {
        const additionalMetric = additionalMetricsByFieldId[fieldId];
        let compiledSql: string;
        let aggregation: MetricType;
        if (additionalMetric) {
            const compiled = compileAdditionalMetric(additionalMetric);
            compiledSql = compiled.compiledSql;
            aggregation = additionalMetric.type;
            compiled.tablesReferences.forEach((table) =>
                referencedTables.add(table),
            );
        } else {
            const metric = metricsByFieldId[fieldId];
            if (!metric) {
                throw new ParameterError(
                    `Pre-aggregate "${preAggregateDef.name}" references unknown metric field ID "${fieldId}"`,
                );
            }
            compiledSql = metric.compiledSql;
            aggregation = metric.type;
            (metric.tablesReferences ?? [metric.table]).forEach((table) =>
                referencedTables.add(table),
            );
        }
        selects.push(`  ${compiledSql} AS ${q}${fieldId}${q}`);
        const component = componentParentByFieldId[fieldId];
        columns.push({
            name: fieldId,
            role: component
                ? MaterializationColumnRole.METRIC_COMPONENT
                : MaterializationColumnRole.METRIC,
            granularity: null,
            aggregation,
            parentMetricFieldId: component?.parent ?? null,
        });
    });

    const filterRules = getFilterRulesFromGroup(metricQuery.filters.dimensions);
    const filterSqls = filterRules.map((rule) => {
        const dimension = getDimension(rule.target.fieldId);
        (dimension.tablesReferences ?? [dimension.table]).forEach((table) =>
            referencedTables.add(table),
        );
        return `(\n  ${renderFilterRuleSqlFromField(
            rule,
            dimension,
            q,
            warehouseSqlBuilder.getStringQuoteChar(),
            (value) => warehouseSqlBuilder.escapeString(value),
            warehouseSqlBuilder.getStartOfWeek(),
            warehouseSqlBuilder.getAdapterType(),
            'UTC',
            DEFAULT_FILTER_CASE_SENSITIVE,
        )}\n)`;
    });

    // Pull in transitive join dependencies from the join ON clauses
    const resolveJoinDependencies = (): boolean =>
        sourceExplore.joinedTables.reduce<boolean>((addedNewTables, join) => {
            if (!referencedTables.has(join.table) && !join.always) {
                return addedNewTables;
            }
            referencedTables.add(join.table);
            return (join.tablesReferences ?? []).reduce<boolean>(
                (added, table) => {
                    if (referencedTables.has(table)) {
                        return added;
                    }
                    referencedTables.add(table);
                    return true;
                },
                addedNewTables,
            );
        }, false);
    while (resolveJoinDependencies()) {
        // keep resolving until no new tables are added
    }

    const joinSqls = sourceExplore.joinedTables
        .filter((join) => referencedTables.has(join.table) || join.always)
        .map(
            (join) =>
                `${getJoinType(join.type)} ${
                    sourceExplore.tables[join.table].sqlTable
                } AS ${q}${join.table}${q}\n  ON ${join.compiledSqlOn}`,
        );

    const baseTable = sourceExplore.tables[sourceExplore.baseTable];
    const groupByIndexes = metricQuery.dimensions.map((_, index) => index + 1);

    // Parity with MetricQueryBuilder: only the base table's sql_filter applies
    const whereClauses = [
        ...(baseTable.sqlWhere ? [baseTable.sqlWhere] : []),
        ...(filterSqls.length > 0 ? [`(${filterSqls.join(' AND ')})`] : []),
    ];

    const sql = [
        'SELECT',
        selects.join(',\n'),
        `FROM ${baseTable.sqlTable} AS ${q}${sourceExplore.baseTable}${q}`,
        ...joinSqls,
        ...(whereClauses.length > 0
            ? [`WHERE ${whereClauses.join(' AND ')}`]
            : []),
        ...(groupByIndexes.length > 0
            ? [`GROUP BY ${groupByIndexes.join(',')}`]
            : []),
    ].join('\n');

    if (USER_ATTRIBUTE_PATTERN.test(sql)) {
        throw new ParameterError(
            `Pre-aggregate "${preAggregateDef.name}" materialization SQL references user attributes or parameters, which cannot be resolved outside the Lightdash server.`,
        );
    }

    return { sql, columns, payload };
};
