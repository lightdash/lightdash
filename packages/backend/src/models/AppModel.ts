import { NotFoundError } from '@lightdash/common';
import { Knex } from 'knex';
import {
    AppsTableName,
    AppVersionsTableName,
    type AppVersionStatus,
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
        status: AppVersionStatus,
    ): Promise<{ app: DbApp; version: DbAppVersion }> {
        return this.database.transaction(async (trx) => {
            const [appRow] = await trx(AppsTableName)
                .insert(app)
                .returning('*');
            const [versionRow] = await trx(AppVersionsTableName)
                .insert({
                    ...version,
                    app_id: appRow.app_id,
                    status,
                    created_by_user_uuid: appRow.created_by_user_uuid,
                })
                .returning('*');
            return { app: appRow, version: versionRow };
        });
    }

    async updateVersionStatus(
        appId: string,
        version: number,
        status: AppVersionStatus,
        error?: string | null,
    ): Promise<void> {
        await this.database(AppVersionsTableName)
            .where({ app_id: appId, version })
            .update({ status, error: error ?? null });
    }

    async getApp(appId: string): Promise<DbApp> {
        const row = await this.database(AppsTableName)
            .where({ app_id: appId })
            .whereNull('deleted_at')
            .first();
        if (!row) {
            throw new NotFoundError(`App not found: ${appId}`);
        }
        return row;
    }

    async getLatestVersion(appId: string): Promise<DbAppVersion | null> {
        const row = await this.database(AppVersionsTableName)
            .where({ app_id: appId })
            .orderBy('version', 'desc')
            .first();
        return row ?? null;
    }

    async getLatestReadyVersion(appId: string): Promise<DbAppVersion | null> {
        const row = await this.database(AppVersionsTableName)
            .where({ app_id: appId, status: 'ready' })
            .orderBy('version', 'desc')
            .first();
        return row ?? null;
    }

    async createVersion(
        appId: string,
        version: Pick<DbAppVersion, 'version' | 'prompt'>,
        status: AppVersionStatus,
        createdByUserUuid: string,
    ): Promise<DbAppVersion> {
        const [row] = await this.database(AppVersionsTableName)
            .insert({
                ...version,
                app_id: appId,
                status,
                created_by_user_uuid: createdByUserUuid,
            })
            .returning('*');
        return row;
    }

    async updateSandboxId(
        appId: string,
        sandboxId: string | null,
    ): Promise<void> {
        await this.database(AppsTableName)
            .where({ app_id: appId })
            .update({ sandbox_id: sandboxId });
    }
}
