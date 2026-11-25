import {
    DashboardTileTypes,
    DATA_APP_ANALYSIS_INSTRUCTIONS_MAX_CHARS,
    ParameterError,
    type CreateDashboard,
    type CreateDashboardAiSummaryTile,
    type DashboardAiSummaryScope,
    type DashboardAiSummaryTile,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DashboardTileAiSummariesTableName,
    DashboardTilesTableName,
} from '../../database/entities/dashboards';

type AiSummaryTileConfigV1 = {
    version: 1;
    instructions: string | null;
    scope: DashboardAiSummaryScope;
};

/** What the `config` column of an AI summary tile holds. Add a version to change its shape */
export type DbAiSummaryTileConfig = AiSummaryTileConfigV1;

const DEFAULT_SCOPE: DashboardAiSummaryScope = { type: 'tab' };

export function onAiSummaryTile(this: Knex.JoinClause) {
    this.on(
        `${DashboardTileAiSummariesTableName}.dashboard_tile_uuid`,
        '=',
        `${DashboardTilesTableName}.dashboard_tile_uuid`,
    ).andOn(
        `${DashboardTileAiSummariesTableName}.dashboard_version_id`,
        '=',
        `${DashboardTilesTableName}.dashboard_version_id`,
    );
}

export const toAiSummaryTile = (
    base: Omit<DashboardAiSummaryTile, 'type' | 'properties'>,
    row: {
        ai_summary_title: string | null;
        ai_summary_config: DbAiSummaryTileConfig | null;
    },
): DashboardAiSummaryTile => ({
    ...base,
    type: DashboardTileTypes.AI_SUMMARY,
    properties: {
        title: row.ai_summary_title ?? '',
        // A version this build does not know falls back to the defaults
        ...(row.ai_summary_config?.version === 1
            ? {
                  instructions: row.ai_summary_config.instructions,
                  scope: row.ai_summary_config.scope,
              }
            : { instructions: null, scope: DEFAULT_SCOPE }),
    },
});

export const insertAiSummaryTiles = async (
    trx: Knex.Transaction,
    dashboardVersionId: number,
    tiles: ReadonlyArray<CreateDashboard['tiles'][number] & { uuid: string }>,
) => {
    const aiSummaryTiles = tiles.filter(
        (tile): tile is CreateDashboardAiSummaryTile & { uuid: string } =>
            tile.type === DashboardTileTypes.AI_SUMMARY,
    );
    if (aiSummaryTiles.length === 0) return;
    if (
        aiSummaryTiles.some(
            ({ properties }) =>
                (properties.instructions?.length ?? 0) >
                DATA_APP_ANALYSIS_INSTRUCTIONS_MAX_CHARS,
        )
    ) {
        throw new ParameterError(
            `AI summary instructions are limited to ${DATA_APP_ANALYSIS_INSTRUCTIONS_MAX_CHARS} characters`,
        );
    }

    await trx(DashboardTileAiSummariesTableName).insert(
        aiSummaryTiles.map(({ uuid, properties }) => ({
            dashboard_version_id: dashboardVersionId,
            dashboard_tile_uuid: uuid,
            title: properties.title,
            config: {
                version: 1 as const,
                instructions: properties.instructions?.trim() || null,
                scope: properties.scope,
            },
        })),
    );
};

/** Points a copied tile's scope at the copy's own tile uuids */
export const remapAiSummaryTileConfig = (
    config: DbAiSummaryTileConfig,
    tileUuidBySource: ReadonlyMap<string, string>,
): DbAiSummaryTileConfig =>
    config.scope.type === 'tiles'
        ? {
              ...config,
              scope: {
                  type: 'tiles',
                  tileUuids: config.scope.tileUuids.map(
                      (tileUuid) => tileUuidBySource.get(tileUuid) ?? tileUuid,
                  ),
              },
          }
        : config;
