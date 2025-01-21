import type { SpotlightTableConfig } from '@lightdash/common';
import type { Knex } from 'knex';

export const SpotlightTableConfigTableName = 'spotlight_table_config';

export type DbSpotlightTableConfig = {
    spotlight_table_config_uuid: string;
    project_uuid: string;
    column_config: SpotlightTableConfig['columnConfig'];
};

export type DbSpotlightTableConfigIn = Omit<
    DbSpotlightTableConfig,
    'spotlight_table_config_uuid'
>;

export type DbSpotlightTableConfigUpdate = Omit<
    DbSpotlightTableConfig,
    'spotlight_table_config_uuid' | 'project_uuid'
>;

export type SpotlightTableConfigTable = Knex.CompositeTableType<
    DbSpotlightTableConfig,
    DbSpotlightTableConfigIn,
    DbSpotlightTableConfigUpdate
>;

export function convertRow(
    dbSpotlightTableConfig?: DbSpotlightTableConfig,
): SpotlightTableConfig | undefined {
    if (!dbSpotlightTableConfig) {
        return undefined;
    }

    return {
        spotlightTableConfigUuid:
            dbSpotlightTableConfig.spotlight_table_config_uuid,
        projectUuid: dbSpotlightTableConfig.project_uuid,
        columnConfig: dbSpotlightTableConfig.column_config,
    };
}
