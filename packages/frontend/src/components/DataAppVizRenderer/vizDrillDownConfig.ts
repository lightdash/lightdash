import { isField, isMetric, type ItemsMap } from '@lightdash/common';
import { type DrillDownConfig } from '../MetricQueryData/types';
import { isVizIntent, toVizFieldValues } from './vizIntent';

// Resolves a viz's drill click intent (untrusted iframe input) into the
// config DrillDownModal consumes. metricQuery/explore come from the
// MetricQueryDataProvider already mounted on the surface.
export const resolveVizDrillDownConfig = (
    intent: unknown,
    args: { fieldMapping: Record<string, string>; itemsMap: ItemsMap },
): DrillDownConfig => {
    if (!isVizIntent(intent)) {
        throw new Error('Invalid drill-down request.');
    }
    const fieldId = args.fieldMapping[intent.metric];
    const item = fieldId ? args.itemsMap[fieldId] : undefined;
    if (!fieldId || !item) {
        throw new Error(
            `"${intent.metric}" is not bound to a query field on this chart.`,
        );
    }
    if (!isField(item) || !isMetric(item)) {
        throw new Error(`"${intent.metric}" is not a metric on this chart.`);
    }
    return { item, fieldValues: toVizFieldValues(intent.row) };
};
