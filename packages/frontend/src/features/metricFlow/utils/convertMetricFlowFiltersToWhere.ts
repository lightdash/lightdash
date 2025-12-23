import {
    renderFilterRuleSqlFromField as buildFilterRuleSql,
    isAndFilterGroup,
    isFilterGroup,
    isFilterRule,
    SupportedDbtAdapter,
    type FilterableField,
    type FilterGroup,
    type Filters,
    type WeekDay,
} from '@lightdash/common';

const escapeSqlString = (value: string) => value.replace(/'/g, "''");

const buildFilterGroupSql = (
    filterGroup: FilterGroup,
    fieldsMap: Record<string, FilterableField>,
    startOfWeek?: WeekDay,
): string => {
    const items = isAndFilterGroup(filterGroup)
        ? filterGroup.and
        : filterGroup.or;
    const joiner = isAndFilterGroup(filterGroup) ? ' AND ' : ' OR ';

    const parts = items
        .map((item) => {
            if (isFilterGroup(item)) {
                const groupSql = buildFilterGroupSql(
                    item,
                    fieldsMap,
                    startOfWeek,
                );
                return groupSql ? `(${groupSql})` : null;
            }

            if (!isFilterRule(item)) return null;
            const field = fieldsMap[item.target.fieldId];
            if (!field) return null;

            const ruleSql = buildFilterRuleSql(
                item,
                field,
                '',
                "'",
                escapeSqlString,
                startOfWeek,
                SupportedDbtAdapter.POSTGRES,
            );
            return ruleSql ? `(${ruleSql})` : null;
        })
        .filter((value): value is string => !!value);

    return parts.join(joiner);
};

const getGroupSql = (
    filterGroup: FilterGroup | undefined,
    fieldsMap: Record<string, FilterableField>,
    startOfWeek?: WeekDay,
) =>
    filterGroup ? buildFilterGroupSql(filterGroup, fieldsMap, startOfWeek) : '';

const convertMetricFlowFiltersToWhere = (
    filters: Filters,
    fieldsMap: Record<string, FilterableField>,
    startOfWeek?: WeekDay,
): string[] => {
    const groupSqls = [
        getGroupSql(filters.dimensions, fieldsMap, startOfWeek),
        getGroupSql(filters.metrics, fieldsMap, startOfWeek),
        getGroupSql(filters.tableCalculations, fieldsMap, startOfWeek),
    ].filter((sql) => sql.length > 0);

    if (groupSqls.length === 0) return [];

    const combinedSql = groupSqls.map((sql) => `(${sql})`).join(' AND ');
    return [combinedSql];
};

export default convertMetricFlowFiltersToWhere;
