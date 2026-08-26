import { Knex } from 'knex';
import { ContentAsCodeProjectSettingsTableName } from '../database/entities/contentAsCodeWritebacks';

export type ContentAsCodeProjectSettings = {
    syncEnabled: boolean;
    stampedAt: Date;
};

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
            stampedAt: row.stamped_at,
        };
    }

    async upsert(args: {
        projectUuid: string;
        syncEnabled: boolean;
    }): Promise<void> {
        await this.database(ContentAsCodeProjectSettingsTableName)
            .insert({
                project_uuid: args.projectUuid,
                sync_enabled: args.syncEnabled,
            })
            .onConflict('project_uuid')
            .merge({
                sync_enabled: args.syncEnabled,
                stamped_at: this.database.fn.now(),
            });
    }
}
