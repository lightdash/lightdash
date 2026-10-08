import {
    isDimension,
    isFilterableDimension,
    isMetric,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DimensionType,
    type FilterableItem,
} from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { useDashboardFilterField } from '../dashboardFilters/FilterRequirements/useDashboardFilterField';
import { getSqlColumnType } from './fieldKinds';

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

// Null unless the filter is on a SQL column
export const useFilterRuleSqlColumnType = (
    rule: DashboardFilterRule | null,
): DimensionType | null =>
    useDashboardTileStatusContext((c) =>
        rule !== null && rule.target.isSqlColumn
            ? getSqlColumnType(rule, c.sqlChartTilesMetadata)
            : null,
    );
