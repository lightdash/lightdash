import type { SpotlightTableConfig } from '@lightdash/common';
import { Knex } from 'knex';
import type { LightdashConfig } from '../config/parseConfig';
import {
    convertRow,
    SpotlightTableConfigTableName,
} from '../database/entities/spotlightTableConfig';

export type SpotlightTableConfigModelArguments = {
    database: Knex;
    lightdashConfig: LightdashConfig;
};

export class SpotlightTableConfigModel {
    protected database: Knex;

    protected lightdashConfig: LightdashConfig;

    constructor(args: SpotlightTableConfigModelArguments) {
        this.database = args.database;
        this.lightdashConfig = args.lightdashConfig;
    }

    async createSpotlightTableConfig(
        projectUuid: string,
        tableConfig: Pick<SpotlightTableConfig, 'columnConfig'>,
    ): Promise<void> {
        await this.database(SpotlightTableConfigTableName)
            .insert({
                project_uuid: projectUuid,
                column_config: JSON.stringify(
                    tableConfig.columnConfig,
                ) as unknown as SpotlightTableConfig['columnConfig'],
            })
            .onConflict('project_uuid')
            .merge();
    }

    async getSpotlightTableConfig(
        projectUuid: string,
    ): Promise<SpotlightTableConfig | undefined> {
        const result = await this.database(SpotlightTableConfigTableName)
            .where('project_uuid', projectUuid)
            .first();

        return convertRow(result);
    }

    async deleteSpotlightTableConfig(projectUuid: string): Promise<void> {
        await this.database(SpotlightTableConfigTableName)
            .where('project_uuid', projectUuid)
            .delete();
    }
}
