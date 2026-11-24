import {
    ChartType,
    getDimensions,
    getItemId,
    getMetrics,
    type ChartAsCode,
    type Explore,
} from '@lightdash/common';
import { suggestClosestFieldIds } from './suggestClosestFieldIds';

const filterFieldIds = (node: unknown): string[] => {
    if (Array.isArray(node)) return node.flatMap(filterFieldIds);
    if (node === null || typeof node !== 'object') return [];
    const { target } = node as { target?: { fieldId?: unknown } };
    const own =
        target && typeof target.fieldId === 'string' ? [target.fieldId] : [];
    return [...own, ...Object.values(node).flatMap(filterFieldIds)];
};

const layoutFieldIds = (chart: ChartAsCode): string[] => {
    if (chart.chartConfig.type !== ChartType.CARTESIAN) return [];
    const layout = chart.chartConfig.config?.layout;
    return [layout?.xField, ...(layout?.yField ?? [])].filter(
        (id): id is string => typeof id === 'string',
    );
};

/** Field ids a chart references that its explore does not have, with the closest ids. */
export const getChartFieldErrors = (
    chart: ChartAsCode,
    explore: Explore,
): string[] => {
    const { metricQuery } = chart;
    const dimensionIds = getDimensions(explore).map(getItemId);
    const metricIds = getMetrics(explore).map(getItemId);
    const customDimensionIds = (metricQuery.customDimensions ?? []).map(
        (d) => d.id,
    );
    const customMetricIds = (metricQuery.additionalMetrics ?? []).map(
        getItemId,
    );
    const tableCalculationIds = metricQuery.tableCalculations.map(
        (t) => t.name,
    );
    const known = new Set([
        ...dimensionIds,
        ...metricIds,
        ...customDimensionIds,
        ...customMetricIds,
        ...tableCalculationIds,
    ]);
    const suggest = (id: string, pool: string[]) => {
        const closest = suggestClosestFieldIds(id, pool, 3);
        return closest.length ? ` (closest: ${closest.join(', ')})` : '';
    };

    const errors: string[] = [];
    const referenced = [
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...metricQuery.sorts.map((s) => s.fieldId),
        ...filterFieldIds(metricQuery.filters),
        ...layoutFieldIds(chart),
        ...(chart.pivotConfig?.columns ?? []),
    ];
    const unknown = [...new Set(referenced)].filter((id) => !known.has(id));
    unknown.forEach((id) =>
        errors.push(
            `"${id}" is not a field of explore "${explore.name}"${suggest(id, [
                ...known,
            ])}.`,
        ),
    );
    return errors;
};
