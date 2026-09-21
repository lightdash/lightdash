import {
    type DataAppVizPreviewSelection,
    type DataAppVizPreviewSelectionInput,
    type Filters,
} from '@lightdash/common';
import { type PreviewQuerySelection } from '../builder/previewDataTypes';

/**
 * A remembered selection as the preview holds it. Reading one binds inputs and
 * nothing else: no query is issued, and the saved chart it names is not re-read.
 */
export const previewSelectionFromApi = (
    remembered: DataAppVizPreviewSelection | null,
): PreviewQuerySelection | null => {
    if (remembered === null) return null;
    const { metricQuery } = remembered;
    // A query for another explore cannot be this selection's.
    if (metricQuery.exploreName !== remembered.exploreName) return null;
    return {
        kind: 'query',
        exploreName: remembered.exploreName,
        savedChart: remembered.savedChart,
        metricQuery: {
            exploreName: metricQuery.exploreName,
            dimensions: metricQuery.dimensions,
            metrics: metricQuery.metrics,
            filters: metricQuery.filters as Filters,
            sorts: metricQuery.sorts,
            limit: metricQuery.limit,
            tableCalculations: metricQuery.tableCalculations,
            additionalMetrics: metricQuery.additionalMetrics ?? undefined,
            customDimensions: metricQuery.customDimensions ?? undefined,
        },
        fieldMapping: remembered.fieldMapping,
    };
};

/**
 * What a run remembers: the explore, the query shape and the binding its rows
 * belong to. Every key is listed here, so nothing else — least of all rows —
 * can ride along with a selection.
 */
export const previewSelectionToApi = ({
    exploreName,
    savedChart,
    metricQuery,
    fieldMapping,
}: PreviewQuerySelection): DataAppVizPreviewSelectionInput => ({
    exploreName,
    savedChart,
    metricQuery: {
        exploreName: metricQuery.exploreName,
        dimensions: metricQuery.dimensions,
        metrics: metricQuery.metrics,
        filters: metricQuery.filters,
        sorts: metricQuery.sorts,
        limit: metricQuery.limit,
        tableCalculations: metricQuery.tableCalculations,
        additionalMetrics: metricQuery.additionalMetrics ?? null,
        customDimensions: metricQuery.customDimensions ?? null,
    },
    fieldMapping,
});
