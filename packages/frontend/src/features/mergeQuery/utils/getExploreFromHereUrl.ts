import { type SavedChart } from '@lightdash/common';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import { MERGE_URL_PARAM, serializeMergeState } from '../context/mergeUrlState';
import { restoreSavedMerge } from '../context/restoreSavedMerge';

/**
 * The Explorer URL that reopens a saved chart with its merge restored the way
 * the merge editor restores it: the primary query as the chart, the other
 * source and the join in the merge search param. An ordinary chart gets the
 * same URL it always did.
 */
export const getExploreFromHereUrl = (
    chart: SavedChart,
): { pathname: string; search: string } => {
    const url = getExplorerUrlFromCreateSavedChartVersion(
        chart.projectUuid,
        chart,
        true,
    );
    const restored = chart.merge ? restoreSavedMerge(chart.merge) : null;
    if (!restored) return url;
    const search = new URLSearchParams(url.search);
    search.set(MERGE_URL_PARAM, serializeMergeState(restored));
    return { pathname: url.pathname, search: search.toString() };
};
