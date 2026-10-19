import {
    parseMergeDefinitionReference,
    parseSavedMergeDefinition,
} from '@lightdash/common';
import { getNextMergeSourceId, PRIMARY_SOURCE_ID } from '../constants';
import { type MergeEditorSource } from './context';
import { type MergeUrlState } from './mergeUrlState';

/**
 * Turns a chart's stored merge back into editable state. The editor
 * addresses the chart's query and the other queries by stable handles; the
 * names they run under ride along so the saved chart's column ids hold.
 *
 * The runtime boundary accepts unknown because an already-open browser can
 * retain an older API response after the app updates. Unsupported shapes are
 * ignored rather than crashing the chart; they are never converted.
 */
export const restoreSavedMerge = (value: unknown): MergeUrlState | null => {
    const merge = parseSavedMergeDefinition(value);
    if (!merge) return null;
    const additionalSources: MergeEditorSource[] = [];
    const repeatValuesSourceIds: string[] = merge.chartRepeats
        ? [PRIMARY_SOURCE_ID]
        : [];
    Object.entries(merge.queries).forEach(([name, query]) => {
        const id = getNextMergeSourceId(additionalSources);
        if (query.repeat) repeatValuesSourceIds.push(id);
        additionalSources.push({
            id,
            name,
            exploreName: query.explore,
            dimensions: query.dimensions,
            metrics: query.metrics,
            filters: query.filters ?? {},
            additionalMetrics: query.additionalMetrics,
            customDimensions: query.customDimensions,
            ...(query.tableCalculations?.length
                ? { tableCalculations: query.tableCalculations }
                : {}),
            ...(query.metricOverrides
                ? { metricOverrides: query.metricOverrides }
                : {}),
            ...(query.dimensionOverrides
                ? { dimensionOverrides: query.dimensionOverrides }
                : {}),
            ...(query.timezone ? { timezone: query.timezone } : {}),
        });
    });
    return {
        focus: { kind: 'source', sourceId: PRIMARY_SOURCE_ID },
        primarySourceName: merge.chartAs ?? null,
        additionalSources,
        joinParts: Object.entries(merge.keys).map(
            ([chartFieldId, references]) => {
                const keyName = merge.keyNames?.[chartFieldId];
                const parsed = references.map(parseMergeDefinitionReference);
                return {
                    ...(keyName ? { name: keyName } : {}),
                    fieldIdBySourceId: {
                        [PRIMARY_SOURCE_ID]: chartFieldId,
                        ...Object.fromEntries(
                            additionalSources.map((source) => [
                                source.id,
                                parsed.find(
                                    ({ query }) => query === source.name,
                                )?.fieldId ?? null,
                            ]),
                        ),
                    },
                };
            },
        ),
        joinType: merge.join,
        repeatValuesSourceIds,
        tableCalculations: merge.tableCalculations ?? [],
    };
};
