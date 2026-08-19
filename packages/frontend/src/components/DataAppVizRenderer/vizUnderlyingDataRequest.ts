import {
    getDimensions,
    getFields,
    getItemId,
    isCustomBinDimension,
    isField,
    isResultValue,
    QueryExecutionContext,
    type DataAppVizUnderlyingDataIntent,
    type DateZoom,
    type ExecuteAsyncUnderlyingDataRequestParams,
    type Explore,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type ResultValue,
} from '@lightdash/common';
import { convertDateFilters } from '../../utils/dateFilter';
import {
    combineUnderlyingDataFilters,
    getUnderlyingDataFilterParts,
} from '../MetricQueryData/underlyingDataFilters';

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

const isIntent = (input: unknown): input is DataAppVizUnderlyingDataIntent =>
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { metric?: unknown }).metric === 'string' &&
    typeof (input as { row?: unknown }).row === 'object' &&
    (input as { row?: unknown }).row !== null;

// Rewrites a viz's semantic click intent (untrusted iframe input) into the
// real underlying-data request, using the same point-filter construction as
// UnderlyingDataModal.
export const buildVizUnderlyingDataRequest = (
    intent: unknown,
    args: VizUnderlyingDataRewriteArgs,
): VizUnderlyingDataRequest => {
    if (!isIntent(intent)) {
        throw new Error('Invalid underlying-data request.');
    }

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

    // ResultRow cells → the { raw, formatted } fieldValues the shared builder
    // consumes; cells that fail strict ResultValue validation are skipped —
    // the payload crosses an untrusted iframe boundary.
    const fieldValues: Record<string, ResultValue> = Object.fromEntries(
        Object.entries(intent.row).flatMap(([id, cell]) =>
            isResultValue(cell) ? [[id, cell.value]] : [],
        ),
    );

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
            ...(intent.limit !== undefined ? { limit: intent.limit } : {}),
            ...(args.parameters && Object.keys(args.parameters).length > 0
                ? { parameters: args.parameters }
                : {}),
        },
    };
};
