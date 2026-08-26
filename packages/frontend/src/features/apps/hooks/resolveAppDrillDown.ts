import {
    isField,
    isMetric,
    isResultValue,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { type DrillDownConfig } from '../../../components/MetricQueryData/types';

export type AppDrillDownSource = {
    metricQuery: MetricQuery;
    fields: ItemsMap;
    parameters?: ParametersValuesMap;
};

type AppDrillDownIntent = {
    queryUuid: string;
    row: Record<string, unknown>;
    metric: string;
};

const parseIntent = (input: unknown): AppDrillDownIntent => {
    if (
        typeof input !== 'object' ||
        input === null ||
        typeof (input as { queryUuid?: unknown }).queryUuid !== 'string' ||
        typeof (input as { metric?: unknown }).metric !== 'string' ||
        typeof (input as { row?: unknown }).row !== 'object' ||
        (input as { row?: unknown }).row === null
    ) {
        throw new Error('Invalid drill-down request.');
    }
    return input as AppDrillDownIntent;
};

/** Resolve an untrusted full-app click intent against query context captured
 * by the host itself. Nothing query-shaped from the iframe is trusted. */
export const resolveAppDrillDown = (
    input: unknown,
    sources: ReadonlyMap<string, AppDrillDownSource>,
): DrillDownConfig => {
    const intent = parseIntent(input);
    const source = sources.get(intent.queryUuid);
    if (!source) {
        throw new Error(
            'The source query for this data point is no longer available. Refresh the app and try again.',
        );
    }

    if (!source.metricQuery.metrics.includes(intent.metric)) {
        throw new Error(`"${intent.metric}" is not a metric in this query.`);
    }
    const item = source.fields[intent.metric];
    if (!item || !isField(item) || !isMetric(item)) {
        throw new Error(`"${intent.metric}" is not a drillable metric.`);
    }

    const fieldValues = Object.fromEntries(
        Object.entries(intent.row).flatMap(([fieldId, cell]) =>
            isResultValue(cell) ? [[fieldId, cell.value]] : [],
        ),
    );
    for (const dimension of source.metricQuery.dimensions) {
        if (!Object.prototype.hasOwnProperty.call(fieldValues, dimension)) {
            throw new Error(
                `Cannot drill down because the row is missing dimension "${dimension}". Pass the original row returned by useLightdash().`,
            );
        }
    }

    return {
        item,
        fieldValues,
        source: {
            tableName: source.metricQuery.exploreName,
            metricQuery: source.metricQuery,
            parameters: source.parameters,
        },
    };
};
