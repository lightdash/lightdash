import { type ContentAsCodeProjectSettings } from '@lightdash/common';
import { Knex } from 'knex';
import { ContentAsCodeProjectSettingsTableName } from '../database/entities/contentAsCodeWritebacks';

type ContentAsCodeProjectSettingsModelArguments = {
    database: Knex;
};

export class ContentAsCodeProjectSettingsModel {
    private readonly database: Knex;

    constructor({ database }: ContentAsCodeProjectSettingsModelArguments) {
        this.database = database;
    }

    async get(
        projectUuid: string,
    ): Promise<ContentAsCodeProjectSettings | undefined> {
        const row = await this.database(ContentAsCodeProjectSettingsTableName)
            .where({ project_uuid: projectUuid })
            .first();
        if (row === undefined) return undefined;
        return {
            syncEnabled: row.sync_enabled,
            path: row.content_path,
            stampedAt: row.stamped_at,
        };
    }

    // path null: the stamping client predates the setting, keep what is stored
    async upsert(args: {
        projectUuid: string;
        syncEnabled: boolean;
        path: string | null;
    }): Promise<void> {
        const pathColumn =
            args.path === null ? {} : { content_path: args.path };
        await this.database(ContentAsCodeProjectSettingsTableName)
            .insert({
                project_uuid: args.projectUuid,
                sync_enabled: args.syncEnabled,
                ...pathColumn,
            })
            .onConflict('project_uuid')
            .merge({
                sync_enabled: args.syncEnabled,
                stamped_at: this.database.fn.now(),
                ...pathColumn,
            });
    }
}
