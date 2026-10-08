import {
    DimensionType,
    getFilterTypeFromItem,
    getFilterTypeFromItemType,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
    type ResultColumn,
} from '@lightdash/common';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';

export const getFieldKind = (field: DashboardFilterableField): FilterType =>
    getFilterTypeFromItemType(field.type);

// One entry per column name, as the shipped "Select a column to filter" lists
export const getSqlColumnOptions = (
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>,
): ResultColumn[] => [
    ...new Map(
        Object.values(sqlChartTilesMetadata)
            .flatMap((metadata) => metadata.columns)
            .map((column): [string, ResultColumn] => [
                column.reference,
                column,
            ]),
    ).values(),
];

// The type a SQL column filter works on: the column's as a tile reports it,
// else the one the target carries, as the shipped bar reads it
export const getSqlColumnType = (
    rule: DashboardFilterRule,
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>,
): DimensionType =>
    Object.values(sqlChartTilesMetadata)
        .flatMap((metadata) => metadata.columns)
        .find((column) => column.reference === rule.target.fieldId)?.type ??
    rule.target.fallbackType ??
    DimensionType.STRING;

// Operators and inputs of a filter: its field's, else its SQL column's
export const getFilterRuleType = (
    field: DashboardFilterableField | null,
    sqlColumnType: DimensionType | null,
): FilterType =>
    field !== null
        ? getFilterTypeFromItem(field)
        : getFilterTypeFromItemType(sqlColumnType ?? DimensionType.STRING);
