import {
    friendlyName,
    getItemLabelWithoutTableName,
    getItemMap,
    QuerySourceType,
    type ItemsMap,
    type SourceQuery,
} from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getExplore } from '../../../../../../../hooks/useExplore';
import { useLightdashApi } from '../../../../../../../providers/LightdashApi/useLightdashApi';
import { type PipelineNode } from '../groupPipeline';
import {
    summarizeMergeNode,
    type MergeNodeSummary,
    type MergeSourceInfo,
} from '../mergeNodeSummary';

export type MergeNodeView = {
    summary: MergeNodeSummary;
    fieldsMapBySource: Readonly<Record<string, ItemsMap>>;
    exploreLabelBySource: Readonly<Record<string, string>>;
};

/** A merge node resolved against the steps it reads; null for any other node. */
export const useMergeNodeView = (
    query: SourceQuery,
    references: PipelineNode[],
    projectUuid: string,
): MergeNodeView | null => {
    const lightdashApi = useLightdashApi();
    const semanticSources = useMemo(
        () =>
            query.sourceType === QuerySourceType.MERGE
                ? references.flatMap((reference) =>
                      reference.query.sourceType ===
                      QuerySourceType.SEMANTIC_LAYER
                          ? [{ ...reference, query: reference.query }]
                          : [],
                  )
                : [],
        [query, references],
    );
    // Labels fall back to field ids, so a failed explore load stays silent.
    const explores = useQueries({
        queries: semanticSources.map(({ query: source }) => ({
            queryKey: ['tables', source.exploreName, projectUuid],
            queryFn: () =>
                getExplore(lightdashApi, projectUuid, source.exploreName),
            retry: false,
        })),
    });
    const exploreData = explores.map((result) => result.data);
    const exploresKey = explores.map((result) => result.dataUpdatedAt).join();

    return useMemo(() => {
        if (query.sourceType !== QuerySourceType.MERGE) return null;
        const fieldsMapBySource: Record<string, ItemsMap> = {};
        const exploreLabelBySource: Record<string, string> = {};
        const infoById: Record<string, MergeSourceInfo> = {};
        semanticSources.forEach(({ nodeId, title, query: source }, index) => {
            const explore = exploreData[index];
            fieldsMapBySource[nodeId] = explore
                ? getItemMap(
                      explore,
                      source.additionalMetrics,
                      source.tableCalculations,
                      source.customDimensions,
                  )
                : {};
            exploreLabelBySource[nodeId] =
                explore?.label ?? friendlyName(source.exploreName);
            infoById[nodeId] = { title, exploreName: source.exploreName };
        });
        const fieldLabel = (nodeId: string, fieldId: string) => {
            const item = fieldsMapBySource[nodeId]?.[fieldId];
            return item
                ? getItemLabelWithoutTableName(item)
                : friendlyName(fieldId);
        };
        return {
            summary: summarizeMergeNode(query, infoById, fieldLabel),
            fieldsMapBySource,
            exploreLabelBySource,
        };
        // exploreData is a fresh array each render; exploresKey tracks its contents
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, semanticSources, exploresKey]);
};
