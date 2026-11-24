import { type Explore } from '../types/explore';
import {
    AI_ACCESS_NEVER,
    CustomDimensionType,
    isSqlTableCalculation,
    type AiAccess,
} from '../types/field';
import { getFilterRules } from '../types/filter';
import { type AdditionalMetric, type MetricQuery } from '../types/metricQuery';
import { getItemId } from './item';

type AiAccessField = {
    name: string;
    table: string;
    sql: string;
    aiAccess?: AiAccess;
    dimensionReference?: string;
    tablesReferences?: string[];
};

type AiAccessTable = {
    name: string;
    aiAccess?: AiAccess;
    dimensions: Record<string, AiAccessField | undefined>;
    metrics: Record<string, AiAccessField | undefined>;
};

type AiAccessExplore = {
    baseTable: string;
    tables: Record<string, AiAccessTable | undefined>;
};

export type AiAccessRules = {
    hiddenTables: ReadonlySet<string>;
    hiddenFieldIds: ReadonlySet<string>;
    hiddenColumnNames: ReadonlySet<string>;
};

const referencePattern = /\$\{((?!(lightdash|ld)\.)[a-zA-Z0-9_.-]+)\}/g;
const tableColumnPattern = /\$\{TABLE\}\.(\w+)/g;

const getReferencedFieldIds = (sql: string, currentTable: string): string[] =>
    [...sql.matchAll(referencePattern)].flatMap((match) => {
        const ref = match[1];
        if (ref === undefined || ref === 'TABLE') return [];
        const [head, ...rest] = ref.split('.');
        return rest.length === 0
            ? [getItemId({ table: currentTable, name: head })]
            : [getItemId({ table: head, name: rest.join('.') })];
    });

const getReferencedTables = (sql: string): string[] =>
    [...sql.matchAll(referencePattern)].flatMap((match) => {
        const parts = match[1]?.split('.') ?? [];
        return parts.length > 1 ? [parts[0]] : [];
    });

const getTableColumns = (sql: string): string[] =>
    [...sql.matchAll(tableColumnPattern)].flatMap((match) =>
        match[1] === undefined ? [] : [match[1].toLowerCase()],
    );

const getFields = (table: AiAccessTable): AiAccessField[] =>
    [
        ...Object.values(table.dimensions),
        ...Object.values(table.metrics),
    ].filter((field): field is AiAccessField => field !== undefined);

const usesHiddenData = (
    field: AiAccessField,
    hiddenTables: ReadonlySet<string>,
    hiddenFieldIds: ReadonlySet<string>,
    hiddenColumnsByTable: ReadonlyMap<string, ReadonlySet<string>>,
): boolean => {
    if (
        field.dimensionReference !== undefined &&
        hiddenFieldIds.has(field.dimensionReference)
    ) {
        return true;
    }
    if (
        [...getReferencedTables(field.sql), ...(field.tablesReferences ?? [])]
            .filter((table) => table !== field.table)
            .some((table) => hiddenTables.has(table))
    ) {
        return true;
    }
    if (
        getReferencedFieldIds(field.sql, field.table).some((id) =>
            hiddenFieldIds.has(id),
        )
    ) {
        return true;
    }
    const hiddenColumns = hiddenColumnsByTable.get(field.table);
    return (
        hiddenColumns !== undefined &&
        getTableColumns(field.sql).some((column) => hiddenColumns.has(column))
    );
};

/**
 * Fields marked `ai_access: never`, every field of a model marked so, and every
 * field whose SQL is built from one of those.
 */
export const getAiAccessRules = (explore: AiAccessExplore): AiAccessRules => {
    const tables = Object.values(explore.tables).filter(
        (table): table is AiAccessTable => table !== undefined,
    );
    const hiddenTables = new Set(
        tables
            .filter((table) => table.aiAccess === AI_ACCESS_NEVER)
            .map((table) => table.name),
    );
    const hiddenFieldIds = new Set<string>();
    const hiddenColumnsByTable = new Map<string, Set<string>>();

    const hide = (field: AiAccessField) => {
        hiddenFieldIds.add(getItemId(field));
        const columns = hiddenColumnsByTable.get(field.table) ?? new Set();
        getTableColumns(field.sql).forEach((column) => columns.add(column));
        hiddenColumnsByTable.set(field.table, columns);
    };

    tables.forEach((table) => {
        getFields(table).forEach((field) => {
            if (
                hiddenTables.has(table.name) ||
                field.aiAccess === AI_ACCESS_NEVER
            ) {
                hide(field);
            }
        });
    });

    const allFields = tables.flatMap(getFields);
    const hideDependents = (): boolean => {
        const dependents = allFields.filter(
            (field) =>
                !hiddenFieldIds.has(getItemId(field)) &&
                usesHiddenData(
                    field,
                    hiddenTables,
                    hiddenFieldIds,
                    hiddenColumnsByTable,
                ),
        );
        dependents.forEach(hide);
        return dependents.length > 0;
    };
    if (hiddenFieldIds.size > 0 || hiddenTables.size > 0) {
        while (hideDependents());
    }

    const hiddenColumnNames = new Set<string>();
    hiddenColumnsByTable.forEach((columns) =>
        columns.forEach((column) => hiddenColumnNames.add(column)),
    );
    allFields
        .filter((field) => hiddenFieldIds.has(getItemId(field)))
        .forEach((field) => hiddenColumnNames.add(field.name.toLowerCase()));

    return { hiddenTables, hiddenFieldIds, hiddenColumnNames };
};

export const hasAiAccessRules = (rules: AiAccessRules): boolean =>
    rules.hiddenTables.size > 0 || rules.hiddenFieldIds.size > 0;

export const exploreHasAiAccessRules = (explore: AiAccessExplore): boolean =>
    Object.values(explore.tables).some(
        (table) =>
            table !== undefined &&
            (table.aiAccess === AI_ACCESS_NEVER ||
                getFields(table).some(
                    (field) => field.aiAccess === AI_ACCESS_NEVER,
                )),
    );

/**
 * The explore as AI may see it: hidden models and fields are absent. Returns
 * undefined when the explore's base model is hidden.
 */
export const filterExploreForAi = <E extends Explore>(
    explore: E,
): E | undefined => {
    if (!exploreHasAiAccessRules(explore)) return explore;
    const { hiddenTables, hiddenFieldIds } = getAiAccessRules(explore);
    if (hiddenTables.has(explore.baseTable)) return undefined;

    const isVisible = (field: AiAccessField) =>
        !hiddenFieldIds.has(getItemId(field));

    const tables = Object.fromEntries(
        Object.entries(explore.tables)
            .filter(([tableName]) => !hiddenTables.has(tableName))
            .map(([tableName, table]) => [
                tableName,
                {
                    ...table,
                    dimensions: Object.fromEntries(
                        Object.entries(table.dimensions).filter(
                            ([, dimension]) => isVisible(dimension),
                        ),
                    ),
                    metrics: Object.fromEntries(
                        Object.entries(table.metrics).filter(([, metric]) =>
                            isVisible(metric),
                        ),
                    ),
                },
            ]),
    );

    const { unfilteredTables: _unfiltered, ...rest } = explore;
    return {
        ...rest,
        joinedTables: explore.joinedTables.filter(
            (join) => !hiddenTables.has(join.table),
        ),
        tables,
    } as E;
};

const containsWord = (sql: string, words: ReadonlySet<string>): boolean => {
    const tokens = sql.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
    return tokens.some((token) => words.has(token));
};

/**
 * True when an AI query on this explore selects, filters, sorts or computes
 * from a field AI may not use. Custom SQL dimensions are refused outright on
 * an explore with rules, because raw SQL can read any column of a model.
 */
export const metricQueryUsesAiHiddenData = (
    explore: AiAccessExplore,
    metricQuery: Pick<
        MetricQuery,
        | 'exploreName'
        | 'dimensions'
        | 'metrics'
        | 'filters'
        | 'sorts'
        | 'tableCalculations'
        | 'customDimensions'
    > & {
        additionalMetrics?: ReadonlyArray<
            Pick<AdditionalMetric, 'table' | 'baseDimensionName'> & {
                sql?: string;
            }
        >;
    },
): boolean => {
    if (!exploreHasAiAccessRules(explore)) return false;
    const rules = getAiAccessRules(explore);
    if (rules.hiddenTables.has(explore.baseTable)) return true;
    const isHiddenId = (fieldId: string) => rules.hiddenFieldIds.has(fieldId);

    const customDimensions = metricQuery.customDimensions ?? [];
    if (
        customDimensions.some(
            (customDimension) =>
                customDimension.type === CustomDimensionType.SQL ||
                rules.hiddenTables.has(customDimension.table) ||
                isHiddenId(customDimension.dimensionId),
        )
    ) {
        return true;
    }

    const additionalMetrics = metricQuery.additionalMetrics ?? [];
    if (
        additionalMetrics.some((metric) => {
            if (rules.hiddenTables.has(metric.table)) return true;
            if (
                metric.baseDimensionName !== undefined &&
                isHiddenId(
                    getItemId({
                        table: metric.table,
                        name: metric.baseDimensionName,
                    }),
                )
            ) {
                return true;
            }
            const sql = metric.sql ?? '';
            return (
                getReferencedTables(sql).some((table) =>
                    rules.hiddenTables.has(table),
                ) ||
                getReferencedFieldIds(sql, metric.table).some(isHiddenId) ||
                containsWord(sql, rules.hiddenColumnNames)
            );
        })
    ) {
        return true;
    }

    const filterFieldIds = getFilterRules(metricQuery.filters).map(
        (rule) => rule.target.fieldId,
    );
    const tableCalculationRefs = metricQuery.tableCalculations.flatMap(
        (calculation) =>
            isSqlTableCalculation(calculation)
                ? getReferencedFieldIds(calculation.sql, explore.baseTable)
                : [],
    );

    return [
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...metricQuery.sorts.map((sort) => sort.fieldId),
        ...filterFieldIds,
        ...tableCalculationRefs,
    ].some(isHiddenId);
};

export const getProjectAiAccessRules = (
    explores: AiAccessExplore[],
): Pick<AiAccessRules, 'hiddenTables' | 'hiddenFieldIds'> => {
    const hiddenTables = new Set<string>();
    const hiddenFieldIds = new Set<string>();
    explores.filter(exploreHasAiAccessRules).forEach((explore) => {
        const rules = getAiAccessRules(explore);
        rules.hiddenTables.forEach((table) => hiddenTables.add(table));
        rules.hiddenFieldIds.forEach((fieldId) => hiddenFieldIds.add(fieldId));
    });
    return { hiddenTables, hiddenFieldIds };
};
