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
        statusMessage?: string | null,
    ): Promise<void> {
        await this.database(AppVersionsTableName)
            .where({ app_id: appId, version })
            .update({
                status,
                error: error ?? null,
                status_message: statusMessage ?? null,
                status_updated_at: new Date(),
            });
    }

    async updateStatusMessage(
        appId: string,
        version: number,
        statusMessage: string,
    ): Promise<void> {
        await this.database(AppVersionsTableName)
            .where({ app_id: appId, version })
            .update({
                status_message: statusMessage,
                status_updated_at: new Date(),
            });
    }

    async getApp(appId: string, projectUuid: string): Promise<DbApp> {
        const row = await this.database(AppsTableName)
            .where({ app_id: appId, project_uuid: projectUuid })
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

    async getAppWithVersions(
        appId: string,
        projectUuid: string,
        opts: { beforeVersion?: number; limit?: number } = {},
    ): Promise<{
        name: string;
        description: string;
        versions: DbAppVersion[];
        hasMore: boolean;
    }> {
        const limit = opts.limit ?? 20;
        const query = this.database(AppsTableName)
            .leftJoin(
                AppVersionsTableName,
                `${AppsTableName}.app_id`,
                `${AppVersionsTableName}.app_id`,
            )
            .where(`${AppsTableName}.app_id`, appId)
            .andWhere(`${AppsTableName}.project_uuid`, projectUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .select(
                `${AppVersionsTableName}.*`,
                `${AppsTableName}.name`,
                `${AppsTableName}.description`,
            )
            .orderBy(`${AppVersionsTableName}.version`, 'desc')
            .limit(limit + 1);

        if (opts.beforeVersion !== undefined) {
            void query.where(
                `${AppVersionsTableName}.version`,
                '<',
                opts.beforeVersion,
            );
        }

        const rows: ((DbAppVersion | Record<string, null>) & {
            name: string;
            description: string;
        })[] = await query;

        // Left join: if app doesn't exist, zero rows → 404
        if (rows.length === 0) {
            throw new NotFoundError(`App not found: ${appId}`);
        }

        // App-level fields come from every row (same values); grab from first
        const { name, description } = rows[0];

        // If app exists but no versions match, we get one row with all nulls
        const versions = rows.filter(
            (r): r is DbAppVersion & { name: string; description: string } =>
                r.version !== null,
        );
        const hasMore = versions.length > limit;
        return {
            name,
            description,
            versions: versions.slice(0, limit),
            hasMore,
        };
    }

    async updateApp(
        appId: string,
        projectUuid: string,
        update: Partial<Pick<DbApp, 'name' | 'description'>>,
    ): Promise<DbApp> {
        const [row] = await this.database(AppsTableName)
            .where({ app_id: appId, project_uuid: projectUuid })
            .whereNull('deleted_at')
            .update(update)
            .returning('*');
        if (!row) {
            throw new NotFoundError(`App not found: ${appId}`);
        }
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
