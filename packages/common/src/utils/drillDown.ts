import { v4 as uuidv4 } from 'uuid';
import type { DrillStep } from '../types/api/paginatedQuery';
import type { Dimension, FieldId } from '../types/field';
import { FilterOperator, type FilterRule, type Filters } from '../types/filter';
import type { MetricQuery, SortField } from '../types/metricQuery';
import type { ResultValue } from '../types/results';
import {
    isDrillDownPath,
    isDrillThroughPath,
    type DrillConfig,
    type DrillDownPath,
    type DrillPath,
    type DrillThroughTarget,
    type PivotReference,
} from '../types/savedCharts';

/**
 * Build EQUALS filter rules from clicked data point dimension values.
 * For each dimension in the original query, creates a filter that pins
 * the drilled view to the clicked value.
 */
export const buildDrillFilters = (
    fieldValues: Record<string, ResultValue>,
    dimensionIds: FieldId[],
): FilterRule[] =>
    dimensionIds.reduce<FilterRule[]>((acc, dimId) => {
        const value = fieldValues[dimId];
        if (!value) return acc;

        return [
            ...acc,
            {
                id: uuidv4(),
                target: { fieldId: dimId },
                operator:
                    value.raw === null
                        ? FilterOperator.NULL
                        : FilterOperator.EQUALS,
                values: value.raw === null ? undefined : [value.raw],
            },
        ];
    }, []);

/**
 * Merge drill-down filters into an existing Filters object.
 * Drill filters are added as AND conditions to the dimensions filter group.
 */
export const mergeDrillFilters = (
    existingFilters: Filters,
    drillFilters: FilterRule[],
): Filters => {
    if (drillFilters.length === 0) return existingFilters;

    const existingDimensions = existingFilters.dimensions
        ? [existingFilters.dimensions]
        : [];

    return {
        ...existingFilters,
        dimensions: {
            id: uuidv4(),
            and: [...existingDimensions, ...drillFilters],
        },
    };
};

/**
 * Build a modified MetricQuery for a drill path.
 *
 * Takes the original query and applies the drill path configuration:
 * - Swaps dimensions to the drill path's target dimensions
 * - Optionally overrides metrics
 * - Adds EQUALS filters for the clicked row's dimension values
 * - Applies sort overrides or defaults to sorting by first drill dimension
 * - Clears table calculations and custom dimensions (they belong to the original view)
 */
export const buildDrilledMetricQuery = (
    originalQuery: MetricQuery,
    drillPath: DrillDownPath,
    fieldValues: Record<string, ResultValue>,
    originalDimensionIds: FieldId[],
): MetricQuery => {
    const drillFilters = buildDrillFilters(fieldValues, originalDimensionIds);
    const mergedFilters = mergeDrillFilters(
        originalQuery.filters,
        drillFilters,
    );

    const sorts: SortField[] = drillPath.sorts ?? [
        { fieldId: drillPath.dimensions[0], descending: false },
    ];

    return {
        ...originalQuery,
        dimensions: drillPath.dimensions,
        metrics: drillPath.metrics ?? originalQuery.metrics,
        filters: mergedFilters,
        sorts,
        tableCalculations: [],
        customDimensions: [],
    };
};

/**
 * Convert drill stack entries to DrillStep objects with full inline data.
 * Ensures the backend can resolve each step even if the drill path ID
 * doesn't match the saved chart config (e.g., unsaved changes).
 */
export const drillStackToSteps = (
    stack: Array<{
        drillPath: DrillPath;
        drillDimensionValues: Record<string, unknown>;
    }>,
): DrillStep[] =>
    stack.map((level) => {
        const step: DrillStep = {
            drillPathId: level.drillPath.id,
            drillDimensionValues: level.drillDimensionValues,
        };
        if (isDrillDownPath(level.drillPath)) {
            step.inlineDimensions = level.drillPath.dimensions;
            step.inlineMetrics = level.drillPath.metrics;
            step.inlineSorts = level.drillPath.sorts;
        }
        if (isDrillThroughPath(level.drillPath)) {
            step.linkedChartUuid = level.drillPath.linkedChartUuid;
        }
        return step;
    });

/** State for a drill-through action (navigating to a linked chart) */
export type DrillThroughState = {
    sourceChartUuid: string;
    linkedChartUuid: string;
    drillSteps: DrillStep[];
    filterSummary: string;
    /** How to open the target chart */
    target: DrillThroughTarget;
};

/**
 * Build the state needed to open a linked chart drill-through modal.
 * Extracts raw values from the clicked row, builds a filter summary with
 * dimension labels, and assembles the drill steps array.
 */
export const buildDrillThroughState = ({
    sourceChartUuid,
    drillPathId,
    linkedChartUuid,
    drillConfig,
    fieldValues,
    dimensionIds,
    dimensions,
    existingDrillSteps,
}: {
    sourceChartUuid: string;
    /** ID of the specific drill path the user clicked */
    drillPathId: string;
    linkedChartUuid: string;
    drillConfig: DrillConfig | undefined;
    fieldValues: Record<string, ResultValue>;
    dimensionIds: string[];
    dimensions: Dimension[];
    existingDrillSteps?: DrillStep[];
}): DrillThroughState => {
    const linkedPath = drillConfig?.paths.find((p) => p.id === drillPathId);

    const clickedRawValues = Object.fromEntries(
        dimensionIds
            .filter((id) => fieldValues[id])
            .map((id) => [id, fieldValues[id].raw]),
    );

    const summary = dimensionIds
        .filter((id) => fieldValues[id])
        .map((id) => {
            const dim = dimensions.find((d) => `${d.table}_${d.name}` === id);
            return `${dim?.label ?? id}: ${fieldValues[id].formatted}`;
        })
        .join(', ');

    // Resolve target from the matched drill path, defaulting to modal
    const target: DrillThroughTarget =
        linkedPath && isDrillThroughPath(linkedPath)
            ? linkedPath.target
            : 'modal';

    return {
        sourceChartUuid,
        linkedChartUuid,
        drillSteps: [
            ...(existingDrillSteps ?? []),
            {
                drillPathId: linkedPath?.id ?? '',
                drillDimensionValues: clickedRawValues,
                linkedChartUuid,
            },
        ],
        filterSummary: summary,
        target,
    };
};

/**
 * Inject pivot dimension values into fieldValues under their raw dimension IDs.
 *
 * In grouped/pivoted charts, fieldValues keys use hashed references
 * (e.g. "metric.pivotDim.value") but the drill system expects plain
 * dimension IDs (e.g. "orders_status"). This normalizes them so drill
 * filters include the pivot dimension.
 */
export const normalizePivotFieldValues = (
    fieldValues: Record<string, ResultValue> | undefined,
    pivotReference: PivotReference | undefined,
): Record<string, ResultValue> | undefined => {
    if (!fieldValues) return undefined;
    if (!pivotReference?.pivotValues) return fieldValues;

    const values = { ...fieldValues };
    for (const pv of pivotReference.pivotValues) {
        if (!values[pv.field]) {
            values[pv.field] = {
                raw: pv.value,
                formatted: String(pv.value ?? ''),
            };
        }
    }
    return values;
};
