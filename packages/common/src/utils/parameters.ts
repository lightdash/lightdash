import { getItemMap } from '../index';
import { type Explore } from '../types/explore';
import { isField, type Item } from '../types/field';
import { type MetricQuery } from '../types/metricQuery';

// Utility to extract parameter references from a metric query and explore
export function getParameterReferencesFromMetricQuery(
    explore: Explore | undefined,
    metricQuery: MetricQuery,
): string[] {
    if (!explore) return [];
    const activeFields: string[] = [
        ...(metricQuery.dimensions || []),
        ...(metricQuery.metrics || []),
        ...(metricQuery.tableCalculations || []).map((tc) => tc.name),
    ];
    const exploreItemsMap = getItemMap(explore);
    const result = new Set<string>();
    for (const fieldId of activeFields) {
        const item: Item | undefined = exploreItemsMap[fieldId];
        if (isField(item) && Array.isArray(item.parameterReferences)) {
            item.parameterReferences.forEach((ref) => result.add(ref));
        } else if (
            item &&
            'parameterReferences' in item &&
            Array.isArray(
                (item as { parameterReferences?: string[] })
                    .parameterReferences,
            )
        ) {
            (
                item as { parameterReferences?: string[] }
            ).parameterReferences!.forEach((ref) => result.add(ref));
        }
    }
    return Array.from(result);
}
