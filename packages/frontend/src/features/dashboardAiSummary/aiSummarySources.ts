import {
    type DashboardAiSummaryTile,
    type DashboardTile,
    type DataAppAnalysisSource,
} from '@lightdash/common';
import { isAnalysableTile } from '../dashboard/store/analysisSourceSelectors';
import { type TileQueryRegistration } from '../dashboard/store/dashboardTileStatusReducer';

export type AiSummarySources = {
    /** Ready queries of the charts in scope, deduped by queryUuid. */
    sources: DataAppAnalysisSource[];
    /** True while a chart in scope has not reported its query yet. */
    inFlight: boolean;
    /** Charts the tile is set to read, loaded or not. */
    chartCount: number;
};

/** Charts a summary on this tab can read: other tabs' charts are not loaded with it. */
export const getAiSummaryCandidateTiles = (
    tabUuid: string | null,
    tiles: DashboardTile[],
): DashboardTile[] =>
    tiles.filter(
        (tile) => isAnalysableTile(tile) && (tile.tabUuid ?? null) === tabUuid,
    );

/** The charts an AI summary tile reads: its tab's, or the ones it names there. */
const getAiSummaryScopeTiles = (
    summaryTile: Pick<DashboardAiSummaryTile, 'tabUuid' | 'properties'>,
    tiles: DashboardTile[],
): DashboardTile[] => {
    const { scope } = summaryTile.properties;
    const candidates = getAiSummaryCandidateTiles(
        summaryTile.tabUuid ?? null,
        tiles,
    );
    if (scope.type === 'tab') return candidates;
    const selected = new Set(scope.tileUuids);
    return candidates.filter((tile) => selected.has(tile.uuid));
};

export const getAiSummarySources = (
    summaryTile: Pick<DashboardAiSummaryTile, 'tabUuid' | 'properties'>,
    tiles: DashboardTile[],
    tileQueries: Record<string, TileQueryRegistration>,
): AiSummarySources => {
    const scopeTiles = getAiSummaryScopeTiles(summaryTile, tiles);
    const registrations = scopeTiles.map((tile) => tileQueries[tile.uuid]);
    const ready = registrations.flatMap((registration) =>
        registration?.status === 'ready' && registration.queryUuid !== null
            ? [
                  {
                      queryUuid: registration.queryUuid,
                      label: registration.label,
                  },
              ]
            : [],
    );
    return {
        sources: ready.filter(
            (source, index) =>
                ready.findIndex((s) => s.queryUuid === source.queryUuid) ===
                index,
        ),
        inFlight: registrations.some(
            (registration) => registration === undefined,
        ),
        chartCount: scopeTiles.length,
    };
};
