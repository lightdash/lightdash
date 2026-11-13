import {
    isDashboardComposerChartTile,
    type DashboardComposerChartTile,
    type DashboardTile,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { type ComposerChartModel } from '../../models/ComposerChartModel';

// Duplicate and rollback copy stored pipelines unchanged, so they skip the author checks.

// One at a time: composer slugs take no lock, so parallel copies of one name would collide.
export const duplicateComposerChartTiles = async (
    composerChartModel: Pick<ComposerChartModel, 'duplicate'>,
    tiles: DashboardTile[],
    target: { dashboardUuid: string; userUuid: string },
): Promise<{ from: string; tile: DashboardComposerChartTile }[]> => {
    const copies: { from: string; tile: DashboardComposerChartTile }[] = [];
    for (const tile of tiles.filter(isDashboardComposerChartTile)) {
        const { composerChartUuid } = tile.properties;
        copies.push({
            from: tile.uuid,
            tile: {
                ...tile,
                uuid: uuidv4(),
                properties: {
                    ...tile.properties,
                    composerChartUuid: composerChartUuid
                        ? // eslint-disable-next-line no-await-in-loop
                          await composerChartModel.duplicate(
                              composerChartUuid,
                              target,
                          )
                        : null,
                },
            },
        });
    }
    return copies;
};

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
