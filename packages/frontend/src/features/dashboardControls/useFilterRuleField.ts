import {
    isDimension,
    isFilterableDimension,
    isMetric,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterableItem,
    type FilterType,
} from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import {
    getSqlColumnFilterType,
    getUniqueSqlColumns,
} from '../dashboardFilters/FilterConfiguration/utils';
import { useDashboardFilterField } from '../dashboardFilters/FilterRequirements/useDashboardFilterField';

// A dashboard only ever lists dimensions and metrics
export const toDashboardFilterableField = (
    item: FilterableItem | undefined,
): DashboardFilterableField | null => {
    if (item === undefined) return null;
    if (isMetric(item)) return item;
    return isDimension(item) && isFilterableDimension(item) ? item : null;
};

// The field a filter shows, resolved as the shipped bar does: dimensions and
// metrics, with the labels of the tile it is mapped on. Null for a
// placeholder, a SQL column filter and a field that is gone
export const useFilterRuleField = (
    rule: DashboardFilterRule | null,
): DashboardFilterableField | null => {
    const resolveField = useDashboardFilterField();
    return useMemo(
        () =>
            rule === null
                ? null
                : toDashboardFilterableField(resolveField(rule)),
        [resolveField, rule],
    );
};

// The filter type of a SQL column filter, as the shipped popover reads it.
// Null unless the filter is on a SQL column
export const useFilterRuleSqlColumnType = (
    rule: DashboardFilterRule | null,
): FilterType | null =>
    useDashboardTileStatusContext((c) =>
        rule !== null && rule.target.isSqlColumn
            ? getSqlColumnFilterType(
                  getUniqueSqlColumns(c.sqlChartTilesMetadata),
                  rule.target.fieldId,
                  rule.target.fallbackType,
              )
            : null,
    );
