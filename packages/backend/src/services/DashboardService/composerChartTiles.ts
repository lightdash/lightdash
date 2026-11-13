import {
    isDashboardComposerChartTile,
    type DashboardComposerChartTile,
    type DashboardTile,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { type ComposerChartModel } from '../../models/ComposerChartModel';

// Duplicate and rollback copy stored pipelines unchanged, so they skip the author checks.

export const duplicateComposerChartTiles = async (
    composerChartModel: Pick<ComposerChartModel, 'duplicate'>,
    tiles: DashboardTile[],
    target: { dashboardUuid: string; userUuid: string },
): Promise<{ from: string; tile: DashboardComposerChartTile }[]> =>
    Promise.all(
        tiles.filter(isDashboardComposerChartTile).map(async (tile) => ({
            from: tile.uuid,
            tile: {
                ...tile,
                uuid: uuidv4(),
                properties: {
                    ...tile.properties,
                    composerChartUuid: tile.properties.composerChartUuid
                        ? await composerChartModel.duplicate(
                              tile.properties.composerChartUuid,
                              target,
                          )
                        : null,
                },
            },
        })),
    );

export const rollbackComposerCharts = async (
    composerChartModel: Pick<ComposerChartModel, 'rollbackToVersionAt'>,
    tiles: DashboardTile[],
    at: Date,
    userUuid: string,
    trx: Knex.Transaction,
) => {
    const chartUuids = new Set(
        tiles
            .filter(isDashboardComposerChartTile)
            .flatMap((tile) => tile.properties.composerChartUuid ?? []),
    );
    for (const chartUuid of chartUuids) {
        // eslint-disable-next-line no-await-in-loop
        await composerChartModel.rollbackToVersionAt(
            chartUuid,
            at,
            userUuid,
            trx,
        );
    }
};
