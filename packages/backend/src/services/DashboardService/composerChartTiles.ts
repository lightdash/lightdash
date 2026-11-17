import {
    isDashboardComposerChartTile,
    type Dashboard,
    type DashboardComposerChartTile,
    type DashboardTile,
    type RegisteredAccount,
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

// Copies each chart's current pipeline, so it skips the author checks. One at a time:
// composer slugs take no lock, so parallel copies of one name would collide.
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

/** A rollback that changes a chart's pipeline needs the user to be able to save that pipeline. */
export const assertCanRollbackComposerCharts = async (
    composerChartModel: Pick<ComposerChartModel, 'getRollbackPipelines'>,
    getComposerChartService: () => Pick<
        ComposerChartService,
        'assertCanRestore'
    >,
    account: RegisteredAccount,
    project: ProjectSubject,
    targetVersion: Pick<Dashboard, 'tiles' | 'versionUuid'>,
) => {
    await Promise.all(
        [...getComposerChartUuids(targetVersion.tiles)].map(
            async (chartUuid) => {
                const pipelines = await composerChartModel.getRollbackPipelines(
                    chartUuid,
                    targetVersion.versionUuid,
                );
                if (
                    pipelines &&
                    !isEqual(pipelines.restored, pipelines.current)
                ) {
                    await getComposerChartService().assertCanRestore(
                        account,
                        project,
                        pipelines.restored,
                    );
                }
            },
        ),
    );
};

export const rollbackComposerCharts = async (
    composerChartModel: Pick<ComposerChartModel, 'rollbackToDashboardVersion'>,
    tiles: DashboardTile[],
    dashboardVersionUuid: string,
    userUuid: string,
    trx: Knex.Transaction,
) => {
    for (const chartUuid of getComposerChartUuids(tiles)) {
        // eslint-disable-next-line no-await-in-loop
        await composerChartModel.rollbackToDashboardVersion(
            chartUuid,
            dashboardVersionUuid,
            userUuid,
            trx,
        );
    }
};
