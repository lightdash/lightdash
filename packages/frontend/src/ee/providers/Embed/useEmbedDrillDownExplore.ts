import { type CreateSavedChartVersion, type UUID } from '@lightdash/common';
import { useMemo } from 'react';
import useEmbed from './useEmbed';

type DrillDownExplore = (options: { chart: CreateSavedChartVersion }) => void;

/**
 * Drills stay inside the embed: the drilled chart opens through the embed's
 * explore handler instead of a new tab into the full app, which embed viewers
 * cannot reach. Outside an embed this is undefined and the caller keeps its
 * new-tab link. The default context also carries a no-op handler, so the
 * token, not the handler, decides whether we are embedded.
 */
const useEmbedDrillDownExplore = (
    customSqlProvenanceChartUuid?: UUID,
): DrillDownExplore | undefined => {
    const embed = useEmbed();
    const { embedToken, onExplore, savedChart } = embed;
    const provenanceChartUuid =
        customSqlProvenanceChartUuid ??
        embed.customSqlProvenanceChartUuid ??
        (savedChart && 'uuid' in savedChart ? savedChart.uuid : undefined);

    return useMemo(() => {
        if (!embedToken || !onExplore) {
            return undefined;
        }
        return ({ chart }) =>
            onExplore({
                chart,
                customSqlProvenanceChartUuid: provenanceChartUuid,
            });
    }, [embedToken, onExplore, provenanceChartUuid]);
};

export default useEmbedDrillDownExplore;
