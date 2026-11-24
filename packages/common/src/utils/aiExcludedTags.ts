import { type Explore } from '../types/explore';
import { CustomDimensionType, isSqlTableCalculation } from '../types/field';
import { getFilterRules } from '../types/filter';
import { type AdditionalMetric, type MetricQuery } from '../types/metricQuery';
import { getItemId } from './item';

type FieldFilterTarget = { target: { fieldRef?: string; fieldId?: string } };

type TaggedField = {
    name: string;
    table: string;
    sql: string;
    tags?: string[];
    dimensionReference?: string;
    tablesReferences?: string[];
    filters?: FieldFilterTarget[];
};

type TaggedTable = {
    name: string;
    tags?: string[];
    dimensions: Record<string, TaggedField | undefined>;
    metrics: Record<string, TaggedField | undefined>;
};

type TaggedExplore = {
    baseTable: string;
    tags?: string[];
    tables: Record<string, TaggedTable | undefined>;
};

export type AiExcludedTagRules = {
    hiddenTables: ReadonlySet<string>;
    hiddenFieldIds: ReadonlySet<string>;
    hiddenColumnNames: ReadonlySet<string>;
};

/** Every non-empty tag from the given lists, without duplicates. */
export const mergeExcludedTags = (
    ...lists: ReadonlyArray<readonly string[] | null | undefined>
): string[] =>
    Array.from(
        new Set(
            lists.flatMap((list) =>
                (list ?? []).map((tag) => tag.trim()).filter(Boolean),
            ),
        ),
    );

const hasExcludedTag = (
    tags: readonly string[] | undefined,
    excluded: ReadonlySet<string>,
): boolean => (tags ?? []).some((tag) => excluded.has(tag));

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

const getFilterFieldIds = (
    filters: readonly FieldFilterTarget[] | undefined,
    currentTable: string,
): string[] =>
    (filters ?? []).flatMap(({ target }) => {
        const ref = target.fieldRef ?? target.fieldId;
        if (!ref) return [];
        const [head, ...rest] = ref.split('.');
        return rest.length === 0
            ? [getItemId({ table: currentTable, name: head })]
            : [getItemId({ table: head, name: rest.join('.') })];
    });

const getTableColumns = (sql: string): string[] =>
    [...sql.matchAll(tableColumnPattern)].flatMap((match) =>
        match[1] === undefined ? [] : [match[1].toLowerCase()],
    );

const getFields = (table: TaggedTable): TaggedField[] =>
    [
        ...Object.values(table.dimensions),
        ...Object.values(table.metrics),
    ].filter((field): field is TaggedField => field !== undefined);

const getTables = (explore: TaggedExplore): TaggedTable[] =>
    Object.values(explore.tables).filter(
        (table): table is TaggedTable => table !== undefined,
    );

const usesHiddenData = (
    field: TaggedField,
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
    const sql = field.sql ?? '';
    if (
        [...getReferencedTables(sql), ...(field.tablesReferences ?? [])]
            .filter((table) => table !== field.table)
            .some((table) => hiddenTables.has(table))
    ) {
        return true;
    }
    if (
        [
            ...getReferencedFieldIds(sql, field.table),
            ...getFilterFieldIds(field.filters, field.table),
        ].some((id) => hiddenFieldIds.has(id))
    ) {
        return true;
    }
    const hiddenColumns = hiddenColumnsByTable.get(field.table);
    return (
        hiddenColumns !== undefined &&
        getTableColumns(sql).some((column) => hiddenColumns.has(column))
    );
};

export const exploreHasExcludedTags = (
    explore: TaggedExplore,
    excludedTags: readonly string[],
): boolean => {
    if (excludedTags.length === 0) return false;
    const excluded = new Set(excludedTags);
    return (
        hasExcludedTag(explore.tags, excluded) ||
        getTables(explore).some(
            (table) =>
                hasExcludedTag(table.tags, excluded) ||
                getFields(table).some((field) =>
                    hasExcludedTag(field.tags, excluded),
                ),
        )
    );
};

/**
 * Models and fields with an excluded tag, and every field whose SQL is built
 * from one of those. The explore's own tags count for its base model.
 */
export const getExcludedTagRules = (
    explore: TaggedExplore,
    excludedTags: readonly string[],
): AiExcludedTagRules => {
    const excluded = new Set(excludedTags);
    const tables = getTables(explore);
    const hiddenTables = new Set(
        tables
            .filter(
                (table) =>
                    hasExcludedTag(table.tags, excluded) ||
                    (table.name === explore.baseTable &&
                        hasExcludedTag(explore.tags, excluded)),
            )
            .map((table) => table.name),
    );
    const hiddenFieldIds = new Set<string>();
    const hiddenColumnsByTable = new Map<string, Set<string>>();

    const hide = (field: TaggedField) => {
        hiddenFieldIds.add(getItemId(field));
        const columns = hiddenColumnsByTable.get(field.table) ?? new Set();
        getTableColumns(field.sql ?? '').forEach((column) =>
            columns.add(column),
        );
        hiddenColumnsByTable.set(field.table, columns);
    };

    tables.forEach((table) => {
        getFields(table).forEach((field) => {
            if (
                hiddenTables.has(table.name) ||
                hasExcludedTag(field.tags, excluded)
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

/**
 * The explore as AI may see it: models and fields with an excluded tag are
 * absent. Returns undefined when the explore's base model is excluded.
 */
export const filterExploreByExcludedTags = <E extends Explore>(
    explore: E,
    excludedTags: readonly string[],
    /** The full explore to find excluded data in, when `explore` is already narrowed. */
    rulesSource: TaggedExplore = explore,
): E | undefined => {
    if (!exploreHasExcludedTags(rulesSource, excludedTags)) return explore;
    const { hiddenTables, hiddenFieldIds } = getExcludedTagRules(
        rulesSource,
        excludedTags,
    );
    if (hiddenTables.has(explore.baseTable)) return undefined;

    const isVisible = (field: TaggedField) =>
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
 * from excluded data. Custom SQL dimensions are refused outright on an explore
 * with excluded data, because raw SQL can read any column of a model.
 */
export const metricQueryUsesExcludedData = (
    explore: TaggedExplore,
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
                filters?: FieldFilterTarget[];
            }
        >;
    },
    excludedTags: readonly string[],
): boolean => {
    if (!exploreHasExcludedTags(explore, excludedTags)) return false;
    const rules = getExcludedTagRules(explore, excludedTags);
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
                getFilterFieldIds(metric.filters, metric.table).some(
                    isHiddenId,
                ) ||
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

export const getProjectExcludedTagRules = (
    explores: TaggedExplore[],
    excludedTags: readonly string[],
): Pick<AiExcludedTagRules, 'hiddenTables' | 'hiddenFieldIds'> => {
    const hiddenTables = new Set<string>();
    const hiddenFieldIds = new Set<string>();
    explores
        .filter((explore) => exploreHasExcludedTags(explore, excludedTags))
        .forEach((explore) => {
            const rules = getExcludedTagRules(explore, excludedTags);
            rules.hiddenTables.forEach((table) => hiddenTables.add(table));
            rules.hiddenFieldIds.forEach((fieldId) =>
                hiddenFieldIds.add(fieldId),
            );
        });
    return { hiddenTables, hiddenFieldIds };
};
