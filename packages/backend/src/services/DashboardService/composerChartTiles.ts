import {
    isDashboardComposerChartTile,
    type Dashboard,
    type DashboardComposerChartTile,
    type DashboardTile,
    type RegisteredAccount,
    type UUID,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import { type Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { type ComposerChartModel } from '../../models/ComposerChartModel';
import {
    type ComposerChartService,
    type ProjectSubject,
} from '../ComposerChartService/ComposerChartService';

const getComposerChartUuids = (tiles: DashboardTile[]) =>
    new Set(
        tiles
            .filter(isDashboardComposerChartTile)
            .flatMap((tile) => tile.properties.composerChartUuid ?? []),
    );

// Copies each owned chart's current pipeline, so it skips the author checks; a space's
// chart stays referenced. One at a time: composer slugs take no lock, so parallel copies collide.
export const duplicateComposerChartTiles = async (
    composerChartModel: Pick<
        ComposerChartModel,
        'findOwnedByDashboard' | 'duplicate'
    >,
    tiles: DashboardTile[],
    source: { dashboardUuid: UUID },
    target: { dashboardUuid: string; userUuid: string },
): Promise<{ from: string; tile: DashboardComposerChartTile }[]> => {
    const owned = new Set(
        await composerChartModel.findOwnedByDashboard(source.dashboardUuid, [
            ...getComposerChartUuids(tiles),
        ]),
    );
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
                    composerChartUuid:
                        composerChartUuid && owned.has(composerChartUuid)
                            ? // eslint-disable-next-line no-await-in-loop
                              await composerChartModel.duplicate(
                                  composerChartUuid,
                                  target,
                              )
                            : composerChartUuid,
                },
            },
        });
    }
    return copies;
};

/**
 * Locks the dashboard's own charts for a rollback and checks the user can save each pipeline it changes.
 * Returns them to roll back; a space's chart is left alone.
 */
export const lockComposerChartsForRollback = async (
    composerChartModel: Pick<ComposerChartModel, 'lockRollbackPipelines'>,
    getComposerChartService: () => Pick<
        ComposerChartService,
        'assertCanRestore'
    >,
    account: RegisteredAccount,
    project: ProjectSubject,
    targetVersion: Pick<Dashboard, 'uuid' | 'tiles' | 'versionUuid'>,
    trx: Knex.Transaction,
): Promise<UUID[]> => {
    const chartUuids = [...getComposerChartUuids(targetVersion.tiles)];
    if (chartUuids.length === 0) return [];
    const pipelines = await composerChartModel.lockRollbackPipelines(
        targetVersion.uuid,
        chartUuids,
        targetVersion.versionUuid,
        trx,
    );
    await Promise.all(
        pipelines
            .filter(({ restored, current }) => !isEqual(restored, current))
            .map(({ restored }) =>
                getComposerChartService().assertCanRestore(
                    account,
                    project,
                    restored,
                ),
            ),
    );
    return pipelines.map(({ uuid }) => uuid);
};

export const rollbackComposerCharts = async (
    composerChartModel: Pick<ComposerChartModel, 'rollbackToDashboardVersion'>,
    ownedChartUuids: UUID[],
    dashboardVersionUuid: string,
    userUuid: string,
    trx: Knex.Transaction,
) => {
    for (const chartUuid of ownedChartUuids) {
        // eslint-disable-next-line no-await-in-loop
        await composerChartModel.rollbackToDashboardVersion(
            chartUuid,
            dashboardVersionUuid,
            userUuid,
            trx,
        );
    }
};
