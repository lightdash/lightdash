import {
    getItemMap,
    isField,
    WarehouseTypes,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import type { Dialect } from '@lightdash/formula';

export type FieldMapping = {
    /** displayName → fieldId (for compilation) */
    displayToId: Record<string, string>;
    /** fieldId → displayName (for re-editing) */
    idToDisplay: Record<string, string>;
};

/**
 * Build bidirectional maps between display names and field identifiers
 * from the current explorer context.
 *
 * Only includes fields that are actively used in the metric query
 * (dimensions, metrics, table calculations, custom dimensions).
 */
export function buildFieldMapping(
    explore: Explore | undefined,
    metricQuery: MetricQuery,
): FieldMapping {
    const displayToId: Record<string, string> = {};
    const idToDisplay: Record<string, string> = {};

    if (!explore) return { displayToId, idToDisplay };

    const itemsMap = getItemMap(
        explore,
        metricQuery.additionalMetrics,
        metricQuery.tableCalculations,
        metricQuery.customDimensions,
    );

    const usedFieldIds = new Set([
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...(metricQuery.tableCalculations ?? []).map((tc) => tc.name),
    ]);

    for (const [id, fieldItem] of Object.entries(itemsMap)) {
        if (!usedFieldIds.has(id)) continue;

        const label = isField(fieldItem)
            ? fieldItem.label
            : 'displayName' in fieldItem
              ? (fieldItem.displayName ?? fieldItem.name)
              : fieldItem.name;

        displayToId[label] = id;
        idToDisplay[id] = label;
    }

    return { displayToId, idToDisplay };
}

const warehouseToDialect: Partial<Record<WarehouseTypes, Dialect>> = {
    [WarehouseTypes.POSTGRES]: 'postgres',
    [WarehouseTypes.BIGQUERY]: 'bigquery',
    [WarehouseTypes.SNOWFLAKE]: 'snowflake',
    [WarehouseTypes.DUCKDB]: 'duckdb',
    [WarehouseTypes.REDSHIFT]: 'postgres',
    [WarehouseTypes.DATABRICKS]: 'duckdb',
    [WarehouseTypes.TRINO]: 'postgres',
    [WarehouseTypes.CLICKHOUSE]: 'postgres',
    [WarehouseTypes.ATHENA]: 'postgres',
};

/**
 * Map a Lightdash WarehouseType to a formula package Dialect.
 * Falls back to 'postgres' for unsupported warehouses.
 */
export function getFormulaDialect(
    warehouseType: WarehouseTypes | undefined,
): Dialect {
    if (!warehouseType) return 'postgres';
    return warehouseToDialect[warehouseType] ?? 'postgres';
}
