import {
    isDimension,
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
    const fieldValues = toVizFieldValues(intent.row);
    // Dimension-only marks (e.g. a boxplot box) have no metric value to show.
    const valueLabel =
        fieldValues[fieldId] === undefined
            ? Object.entries(fieldValues)
                  .filter(([id]) => isDimension(args.itemsMap[id]))
                  .map(([, value]) => value.formatted)
                  .join(', ') || undefined
            : undefined;
    return { item, fieldValues, valueLabel };
};
