import {
    getDimensions,
    getFields,
    getItemId,
    isCustomBinDimension,
    isField,
    QueryExecutionContext,
    type DataAppVizUnderlyingDataIntent,
    type DateZoom,
    type ExecuteAsyncUnderlyingDataRequestParams,
    type Explore,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { convertDateFilters } from '../../utils/dateFilter';
import {
    combineUnderlyingDataFilters,
    getUnderlyingDataFilterParts,
} from '../MetricQueryData/underlyingDataFilters';
import { isVizIntent, toVizFieldValues } from './vizIntent';

export type VizUnderlyingDataRewriteArgs = {
    projectUuid: string;
    /** queryUuid of the source query the host ran for this chart. */
    queryUuid: string;
    /** The RECONCILED mapping — exactly what was pushed to the iframe. */
    fieldMapping: Record<string, string>;
    itemsMap: ItemsMap;
    metricQuery: MetricQuery;
    explore: Explore;
    resolvedTimezone: string | undefined;
    parameters: ParametersValuesMap | undefined;
    dateZoom: DateZoom | undefined;
};

export type VizUnderlyingDataRequest = {
    method: 'POST';
    path: string;
    body: ExecuteAsyncUnderlyingDataRequestParams & {
        parameters?: ParametersValuesMap;
    };
};

// Rewrites a viz's semantic click intent (untrusted iframe input) into the
// real underlying-data request, using the same point-filter construction as
// UnderlyingDataModal.
export const buildVizUnderlyingDataRequest = (
    intent: unknown,
    args: VizUnderlyingDataRewriteArgs,
): VizUnderlyingDataRequest => {
    if (!isVizIntent(intent)) {
        throw new Error('Invalid underlying-data request.');
    }
    const { limit } = intent as DataAppVizUnderlyingDataIntent;

    const fieldId = args.fieldMapping[intent.metric];
    const item = fieldId ? args.itemsMap[fieldId] : undefined;
    if (!fieldId || !item) {
        throw new Error(
            `"${intent.metric}" is not bound to a query field on this chart.`,
        );
    }

    const nonBinCustomDimensions =
        args.metricQuery.customDimensions?.filter(
            (dimension) => !isCustomBinDimension(dimension),
        ) ?? [];
    const allFields = [...nonBinCustomDimensions, ...getFields(args.explore)];
    const allDimensions = [
        ...nonBinCustomDimensions,
        ...getDimensions(args.explore),
    ];

    const fieldValues = toVizFieldValues(intent.row);

    const filterParts = getUnderlyingDataFilterParts({
        item,
        value: fieldValues[fieldId] ?? { raw: null, formatted: '' },
        fieldValues,
        // Vizs receive unpivoted rows.
        pivotReference: undefined,
        dateZoom: args.dateZoom,
        allDimensions,
        resolvedTimezone: args.resolvedTimezone,
    });

    const filters = combineUnderlyingDataFilters({
        filterParts,
        exploreDimensionFilters: args.metricQuery.filters?.dimensions,
        allFields,
    });

    return {
        method: 'POST',
        path: `/api/v2/projects/${args.projectUuid}/query/underlying-data`,
        body: {
            context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
            underlyingDataSourceQueryUuid: args.queryUuid,
            // Table calculations are not fields — the itemId is omitted and
            // the clicked dimensions scope the raw rows, matching core.
            ...(isField(item) ? { underlyingDataItemId: getItemId(item) } : {}),
            filters: convertDateFilters(filters),
            ...(args.dateZoom ? { dateZoom: args.dateZoom } : {}),
            ...(limit !== undefined ? { limit } : {}),
            ...(args.parameters && Object.keys(args.parameters).length > 0
                ? { parameters: args.parameters }
                : {}),
        },
    };
};
