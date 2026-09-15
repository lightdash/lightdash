import { isDimension, type DateZoom, type ItemsMap } from '@lightdash/common';
import { type UnderlyingDataConfig } from '../MetricQueryData/types';
import { isVizIntent, toVizFieldValues } from './vizIntent';

export const resolveVizUnderlyingDataConfig = (
    intent: unknown,
    args: {
        fieldMapping: Record<string, string>;
        itemsMap: ItemsMap;
        dateZoom: DateZoom | undefined;
    },
): UnderlyingDataConfig => {
    if (!isVizIntent(intent)) {
        throw new Error('Invalid underlying-data request.');
    }

    const fieldId = args.fieldMapping[intent.metric];
    const item = fieldId ? args.itemsMap[fieldId] : undefined;
    if (!fieldId || !item) {
        throw new Error(
            `"${intent.metric}" is not bound to a query field on this chart.`,
        );
    }
    if (isDimension(item)) {
        throw new Error(`"${intent.metric}" is not a metric on this chart.`);
    }

    const fieldValues = toVizFieldValues(intent.row);
    return {
        item,
        value: fieldValues[fieldId] ?? { raw: null, formatted: '' },
        fieldValues,
        ...(args.dateZoom ? { dateZoom: args.dateZoom } : {}),
    };
};
