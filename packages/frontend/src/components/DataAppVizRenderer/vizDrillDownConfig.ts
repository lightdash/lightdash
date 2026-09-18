import {
    isField,
    isMetric,
    type DataAppVizFieldMapping,
    type ItemsMap,
} from '@lightdash/common';
import { type DrillDownConfig } from '../MetricQueryData/types';
import { isVizIntent, resolveVizFieldId, toVizFieldValues } from './vizIntent';

// Resolves a viz's drill click intent (untrusted iframe input) into the
// config DrillDownModal consumes. metricQuery/explore come from the
// MetricQueryDataProvider already mounted on the surface.
export const resolveVizDrillDownConfig = (
    intent: unknown,
    args: {
        fieldMapping: DataAppVizFieldMapping;
        itemsMap: ItemsMap;
    },
): DrillDownConfig => {
    if (!isVizIntent(intent)) {
        throw new Error('Invalid drill-down request.');
    }
    const fieldId = resolveVizFieldId(intent, args.fieldMapping);
    const item = args.itemsMap[fieldId];
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
