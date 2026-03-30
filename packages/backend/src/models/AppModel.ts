import { Knex } from 'knex';
import {
    AppsTableName,
    AppVersionsTableName,
    type DbApp,
    type DbAppVersion,
} from '../database/entities/apps';

type AppModelArguments = {
    database: Knex;
};

export class AppModel {
    private readonly database: Knex;

    constructor({ database }: AppModelArguments) {
        this.database = database;
    }

    async createWithVersion(
        app: Pick<DbApp, 'project_uuid' | 'created_by_user_uuid'> &
            Partial<Pick<DbApp, 'app_id' | 'name' | 'description'>>,
        version: Pick<DbAppVersion, 'version' | 'prompt'>,
    ): Promise<{ app: DbApp; version: DbAppVersion }> {
        return this.database.transaction(async (trx) => {
            const [appRow] = await trx(AppsTableName)
                .insert(app)
                .returning('*');
            const [versionRow] = await trx(AppVersionsTableName)
                .insert({
                    ...version,
                    app_id: appRow.app_id,
                    status: 'ready',
                    created_by_user_uuid: appRow.created_by_user_uuid,
                })
                .returning('*');
            return { app: appRow, version: versionRow };
        });
    }
}
