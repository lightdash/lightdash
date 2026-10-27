import {
    ChartType,
    metricQueryOfSemanticNode,
    type ApiError,
    type SemanticLayerSourceQuery,
} from '@lightdash/common';
import { useCallback } from 'react';
import useToaster from '../../../../../../../hooks/toaster/useToaster';
import { useCreateShareMutation } from '../../../../../../../hooks/useShare';
import { getOpenInExploreUrl } from '../../../../../../../utils/getOpenInExploreUrl';
import useIsEmbedded from '../../../../../../providers/Embed/useIsEmbedded';

/** Opens a semantic node's query in a new Explore tab; null in embeds. */
export const useExploreFromHere = (projectUuid: string) => {
    const isEmbed = useIsEmbedded();
    const { mutateAsync: createShareUrl } = useCreateShareMutation();
    const { showToastApiError } = useToaster();
    const explore = useCallback(
        async (query: SemanticLayerSourceQuery) => {
            const metricQuery = metricQueryOfSemanticNode(query);
            const url = getOpenInExploreUrl({
                metricQuery,
                projectUuid,
                columnOrder: [
                    ...metricQuery.dimensions,
                    ...metricQuery.metrics,
                ],
                chartConfig: { type: ChartType.TABLE },
                parameters: query.parameters,
            });
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
        [projectUuid, createShareUrl, showToastApiError],
    );
    return isEmbed ? null : explore;
};
