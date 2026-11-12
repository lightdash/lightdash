import {
    ChartType,
    getComposerMergeNodeChart,
    metricQueryOfSemanticNode,
    QuerySourceType,
    type ApiError,
    type SourceQuery,
} from '@lightdash/common';
import { useCallback } from 'react';
import { getExploreFromHereUrl } from '../../../../../../../features/mergeQuery/utils/getExploreFromHereUrl';
import useToaster from '../../../../../../../hooks/toaster/useToaster';
import { useCreateShareMutation } from '../../../../../../../hooks/useShare';
import { getOpenInExploreUrl } from '../../../../../../../utils/getOpenInExploreUrl';
import useIsEmbedded from '../../../../../../providers/Embed/useIsEmbedded';

type ExploreUrl = { pathname: string; search: string };

/** Builds a step's Explore URL on click; null for a step the Explorer cannot open. */
export const getNodeExploreUrl = (
    query: SourceQuery,
    /** The queries of the steps it reads. */
    reads: SourceQuery[],
    projectUuid: string,
): (() => ExploreUrl) | null => {
    if (query.sourceType === QuerySourceType.SEMANTIC_LAYER) {
        return () => {
            const metricQuery = metricQueryOfSemanticNode(query);
            return getOpenInExploreUrl({
                metricQuery,
                projectUuid,
                columnOrder: [
                    ...metricQuery.dimensions,
                    ...metricQuery.metrics,
                ],
                chartConfig: { type: ChartType.TABLE },
                parameters: query.parameters,
            });
        };
    }
    if (query.sourceType === QuerySourceType.MERGE) {
        const chart = getComposerMergeNodeChart(query, reads);
        return chart
            ? () => getExploreFromHereUrl({ ...chart, projectUuid })
            : null;
    }
    return null;
};

/** Opens an Explore URL in a new tab; null in embeds. */
export const useExploreFromHere = () => {
    const isEmbed = useIsEmbedded();
    const { mutateAsync: createShareUrl } = useCreateShareMutation();
    const { showToastApiError } = useToaster();
    const explore = useCallback(
        async (url: ExploreUrl) => {
            // The explore URL can outgrow what a browser accepts; a share link stays short.
            try {
                const shareUrl = await createShareUrl({
                    path: url.pathname,
                    params: `?${url.search}`,
                });
                window.open(`/share/${shareUrl.nanoid}`, '_blank');
            } catch (error) {
                showToastApiError({
                    title: 'Could not open Explore',
                    apiError: (error as ApiError).error,
                });
            }
        },
        [createShareUrl, showToastApiError],
    );
    return isEmbed ? null : explore;
};
