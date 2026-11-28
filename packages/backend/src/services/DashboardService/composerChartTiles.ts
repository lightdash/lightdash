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

// Copies each owned chart's current pipeline, so it skips the author checks; a space's live
// chart stays referenced, a trashed one leaves an empty tile. One at a time: composer slugs take no lock.
export const duplicateComposerChartTiles = async (
    composerChartModel: Pick<
        ComposerChartModel,
        'findOwnedByDashboard' | 'findLiveInSpaces' | 'duplicate'
    >,
    tiles: DashboardTile[],
    source: { dashboardUuid: UUID },
    target: { dashboardUuid: string; userUuid: string },
): Promise<{ from: string; tile: DashboardComposerChartTile }[]> => {
    const chartUuids = [...getComposerChartUuids(tiles)];
    const [owned, referenced] = (
        await Promise.all([
            composerChartModel.findOwnedByDashboard(
                source.dashboardUuid,
                chartUuids,
            ),
            composerChartModel.findLiveInSpaces(chartUuids),
        ])
    ).map((uuids) => new Set(uuids));
    const copies: { from: string; tile: DashboardComposerChartTile }[] = [];
    for (const tile of tiles.filter(isDashboardComposerChartTile)) {
        const { composerChartUuid } = tile.properties;
        let copiedChartUuid: string | null = null;
        if (composerChartUuid && owned.has(composerChartUuid)) {
            // eslint-disable-next-line no-await-in-loop
            copiedChartUuid = await composerChartModel.duplicate(
                composerChartUuid,
                target,
            );
        } else if (composerChartUuid && referenced.has(composerChartUuid)) {
            copiedChartUuid = composerChartUuid;
        }
        copies.push({
            from: tile.uuid,
            tile: {
                ...tile,
                uuid: uuidv4(),
                properties: {
                    ...tile.properties,
                    composerChartUuid: copiedChartUuid,
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
export const lockAndCheckComposerChartRollback = async (
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
