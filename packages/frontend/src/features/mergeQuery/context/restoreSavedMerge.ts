import {
    parseMergeDefinitionReference,
    parseSavedMergeDefinition,
} from '@lightdash/common';
import { getNextMergeSourceId, PRIMARY_SOURCE_ID } from '../constants';
import { type MergeEditorSource } from './context';
import { type MergeUrlState } from './mergeUrlState';

/** Restores source handles while retaining saved names and merged column ids. */
export const restoreSavedMerge = (value: unknown): MergeUrlState | null => {
    const merge = parseSavedMergeDefinition(value);
    if (!merge) return null;
    const additionalSources: MergeEditorSource[] = [];
    Object.entries(merge.queries).forEach(([name, query]) => {
        additionalSources.push({
            id: getNextMergeSourceId(additionalSources),
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
    const handleByName = Object.fromEntries(
        additionalSources.map((source) => [source.name!, source.id]),
    );
    return {
        focus: { kind: 'source', sourceId: PRIMARY_SOURCE_ID },
        primarySourceName: merge.chartAs ?? null,
        additionalSources,
        joinParts: Object.entries(merge.keys).map(
            ([chartFieldId, references]) => ({
                ...(merge.keyNames?.[chartFieldId]
                    ? { name: merge.keyNames[chartFieldId] }
                    : {}),
                fieldIdBySourceId: Object.fromEntries([
                    [PRIMARY_SOURCE_ID, chartFieldId],
                    ...references.map((reference) => {
                        const { query, fieldId } =
                            parseMergeDefinitionReference(reference);
                        return [handleByName[query!], fieldId];
                    }),
                ]),
            }),
        ),
        joinType: merge.join,
        repeatValuesSourceIds: [
            ...(merge.chartRepeats ? [PRIMARY_SOURCE_ID] : []),
            ...additionalSources
                .filter((source) => merge.queries[source.name!].repeat)
                .map((source) => source.id),
        ],
        tableCalculations: merge.tableCalculations ?? [],
    };
};
