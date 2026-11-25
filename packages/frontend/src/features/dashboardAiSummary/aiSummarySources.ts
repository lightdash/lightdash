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

/** The charts an AI summary tile reads: its tab's, or the ones it names. */
const getAiSummaryScopeTiles = (
    summaryTile: Pick<DashboardAiSummaryTile, 'tabUuid' | 'properties'>,
    tiles: DashboardTile[],
): DashboardTile[] => {
    const { scope } = summaryTile.properties;
    const analysable = tiles.filter(isAnalysableTile);
    if (scope.type === 'tiles') {
        const selected = new Set(scope.tileUuids);
        return analysable.filter((tile) => selected.has(tile.uuid));
    }
    return analysable.filter(
        (tile) => (tile.tabUuid ?? null) === (summaryTile.tabUuid ?? null),
    );
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
