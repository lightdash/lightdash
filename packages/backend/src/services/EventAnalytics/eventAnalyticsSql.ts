import {
    ForbiddenError,
    getFieldMap,
    getItemId,
    isAndFilterGroup,
    isDimension,
    isFilterGroup,
    NotFoundError,
    renderFilterRuleSqlFromField,
    type AdditionalMetric,
    type CompiledDimension,
    type CompiledField,
    type Explore,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
    type WarehouseSqlBuilder,
} from '@lightdash/common';

export type EventAnalyticsFieldMap = Record<
    string,
    CompiledField | AdditionalMetric
>;

/** Gets a dimension by field ID. Throws if the field is missing or not a dimension. */
export const getDimensionFromFieldMap = (
    fieldMap: EventAnalyticsFieldMap,
    fieldId: string,
): CompiledDimension => {
    const field = fieldMap[fieldId];

    if (!field) {
        throw new NotFoundError(`Field '${fieldId}' not found in explore`);
    }

    if (!isDimension(field)) {
        throw new NotFoundError(`Field '${fieldId}' is not a dimension`);
    }

    return field;
};

/** Quotes a user-provided string literal for the warehouse. */
export const quoteStringLiteral = (
    sqlBuilder: WarehouseSqlBuilder,
    value: string,
): string => {
    const stringQuote = sqlBuilder.getStringQuoteChar();
    return `${stringQuote}${sqlBuilder.escapeString(value)}${stringQuote}`;
};

/** Gets the explore base table, aliased so that compiled dimension SQL resolves against it. */
export const getBaseTableFromSql = (
    explore: Explore,
    sqlBuilder: WarehouseSqlBuilder,
): string => {
    const q = sqlBuilder.getFieldQuoteChar();
    return `${explore.tables[explore.baseTable].sqlTable} AS ${q}${explore.baseTable}${q}`;
};

type CompileFiltersArgs = {
    filters: Filters | undefined;
    explore: Explore;
    sqlBuilder: WarehouseSqlBuilder;
    timezone: string;
};

/**
 * Compiles the dimension filter group of a `Filters` payload, the same shape
 * the semantic layer uses, into a WHERE fragment over the explore base table.
 * Returns null when there is nothing to filter on.
 */
export const compileEventAnalyticsFilterSql = ({
    filters,
    explore,
    sqlBuilder,
    timezone,
}: CompileFiltersArgs): string | null => {
    if (!filters?.dimensions) return null;

    const fieldMap = getFieldMap(explore);
    const fieldQuoteChar = sqlBuilder.getFieldQuoteChar();
    const stringQuoteChar = sqlBuilder.getStringQuoteChar();
    const escapeString = sqlBuilder.escapeString.bind(sqlBuilder);
    const startOfWeek = sqlBuilder.getStartOfWeek();
    const adapterType = sqlBuilder.getAdapterType();

    const renderRule = (rule: FilterRule): string => {
        const field = getDimensionFromFieldMap(fieldMap, rule.target.fieldId);
        if (field.table !== explore.baseTable) {
            throw new ForbiddenError(
                `Filter on '${getItemId(
                    field,
                )}' is not supported: only fields from the explore base table can be used`,
            );
        }
        return renderFilterRuleSqlFromField(
            rule,
            field,
            fieldQuoteChar,
            stringQuoteChar,
            escapeString,
            startOfWeek,
            adapterType,
            timezone,
        );
    };

    const renderGroup = (group: FilterGroup): string | null => {
        const items: FilterGroupItem[] = isAndFilterGroup(group)
            ? group.and
            : group.or;
        const rendered = items
            .map((item) =>
                isFilterGroup(item) ? renderGroup(item) : renderRule(item),
            )
            .filter((sql): sql is string => sql !== null);
        if (rendered.length === 0) return null;
        const joiner = isAndFilterGroup(group) ? ' AND ' : ' OR ';
        return `(${rendered.join(joiner)})`;
    };

    return renderGroup(filters.dimensions);
};

type EventNamesSqlArgs = {
    explore: Explore;
    sqlBuilder: WarehouseSqlBuilder;
    eventField: CompiledDimension;
    timestampField: CompiledDimension;
    since: Date;
};

/** Builds the query for the distinct event names seen since a date. */
export const buildEventNamesSql = ({
    explore,
    sqlBuilder,
    eventField,
    timestampField,
    since,
}: EventNamesSqlArgs): string => {
    const q = sqlBuilder.getFieldQuoteChar();
    return `
SELECT DISTINCT ${eventField.compiledSql} AS ${q}event_name${q}
FROM ${getBaseTableFromSql(explore, sqlBuilder)}
WHERE ${eventField.compiledSql} IS NOT NULL
  AND ${timestampField.compiledSql} >= ${sqlBuilder.castToTimestamp(since)}
ORDER BY ${q}event_name${q}
LIMIT 1000
`;
};
