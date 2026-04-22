import {
    NotFoundError,
    type KnexPaginateArgs,
    type KnexPaginatedData,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    APP_VERSION_TERMINAL_STATUSES,
    AppsTableName,
    AppVersionsTableName,
    isAppVersionInProgress,
    type AppVersionStatus,
    type DbApp,
    type DbAppVersion,
} from '../database/entities/apps';
import { ProjectTableName } from '../database/entities/projects';
import KnexPaginate from '../database/pagination';

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
                status_updated_at: this.database.fn.now() as unknown as Date,
            });
    }

    /**
     * Update version status only if it is currently in progress.
     * Returns true if the update was applied, false if the version was
     * already in a terminal state (e.g. cancelled by the user).
     */
    async updateVersionStatusIfInProgress(
        appId: string,
        version: number,
        status: AppVersionStatus,
        error?: string | null,
        statusMessage?: string | null,
    ): Promise<boolean> {
        const updatedRows = await this.database(AppVersionsTableName)
            .where({ app_id: appId, version })
            .whereNotIn('status', [...APP_VERSION_TERMINAL_STATUSES])
            .update({
                status,
                error: error ?? null,
                status_message: statusMessage ?? null,
                status_updated_at: this.database.fn.now() as unknown as Date,
            });
        return updatedRows > 0;
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
                status_updated_at: this.database.fn.now() as unknown as Date,
            });
    }

    async getVersionStatus(
        appId: string,
        version: number,
    ): Promise<AppVersionStatus> {
        const row = await this.database(AppVersionsTableName)
            .where({ app_id: appId, version })
            .select('status')
            .first();
        if (!row) {
            throw new NotFoundError(
                `App version not found: ${appId} v${version}`,
            );
        }
        return row.status;
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

    async getVersion(
        appId: string,
        version: number,
    ): Promise<DbAppVersion | null> {
        const row = await this.database(AppVersionsTableName)
            .where({ app_id: appId, version })
            .first();
        return row ?? null;
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
        createdByUserUuid: string;
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
                `${AppsTableName}.created_by_user_uuid`,
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
            created_by_user_uuid: string;
        })[] = await query;

        // Left join: if app doesn't exist, zero rows → 404
        if (rows.length === 0) {
            throw new NotFoundError(`App not found: ${appId}`);
        }

        // App-level fields come from every row (same values); grab from first
        const {
            name,
            description,
            created_by_user_uuid: createdByUserUuid,
        } = rows[0];

        // If app exists but no versions match, we get one row with all nulls
        const versions = rows.filter(
            (r): r is DbAppVersion & { name: string; description: string } =>
                r.version !== null,
        );
        const hasMore = versions.length > limit;
        return {
            name,
            description,
            createdByUserUuid,
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

    async listMyApps(
        userUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<
        KnexPaginatedData<
            {
                app: DbApp;
                projectName: string;
                lastVersion: Pick<DbAppVersion, 'version' | 'status'> | null;
            }[]
        >
    > {
        const latestVersions = this.database(AppVersionsTableName)
            .select('app_id')
            .max('version as version')
            .groupBy('app_id')
            .as('lv');

        const query = this.database(AppsTableName)
            .leftJoin(latestVersions, `${AppsTableName}.app_id`, 'lv.app_id')
            .leftJoin(AppVersionsTableName, function joinVersions() {
                this.on(
                    `${AppsTableName}.app_id`,
                    `${AppVersionsTableName}.app_id`,
                ).andOn('lv.version', `${AppVersionsTableName}.version`);
            })
            .innerJoin(
                ProjectTableName,
                `${AppsTableName}.project_uuid`,
                `${ProjectTableName}.project_uuid`,
            )
            .where(`${AppsTableName}.created_by_user_uuid`, userUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .select(
                `${AppsTableName}.*`,
                `${ProjectTableName}.name as project_name`,
                `${AppVersionsTableName}.version as last_version`,
                `${AppVersionsTableName}.status as last_version_status`,
            )
            .orderBy(`${AppsTableName}.created_at`, 'desc');

        const result = await KnexPaginate.paginate(query, paginateArgs);

        type RowWithVersion = DbApp & {
            project_name: string;
            last_version: number | null;
            last_version_status: string | null;
        };

        const rows = result.data as unknown as RowWithVersion[];

        return {
            data: rows.map(
                ({
                    project_name,
                    last_version,
                    last_version_status,
                    ...app
                }) => ({
                    app,
                    projectName: project_name,
                    lastVersion: last_version
                        ? {
                              version: last_version,
                              status: last_version_status as AppVersionStatus,
                          }
                        : null,
                }),
            ),
            pagination: result.pagination,
        };
    }

    async updateSandboxId(
        appId: string,
        sandboxId: string | null,
    ): Promise<void> {
        await this.database(AppsTableName)
            .where({ app_id: appId })
            .update({ sandbox_id: sandboxId });
    }

    /**
     * Release graphile locks on appGeneratePipeline jobs whose corresponding
     * app_version has not advanced within `threshold` — the previous worker
     * is presumed dead. Released jobs are picked up on the next poll and
     * resumed from their last completed stage.
     *
     * Returns the number of jobs released.
     */
    async releaseStaleLocks(
        terminalStatuses: readonly string[],
        threshold: string,
    ): Promise<number> {
        const result = await this.database.raw<{ rowCount: number }>(
            `UPDATE graphile_worker.jobs j
             SET locked_at = NULL, locked_by = NULL, run_at = now()
             FROM app_versions v
             WHERE j.task_identifier = 'appGeneratePipeline'
               AND j.locked_at IS NOT NULL
               AND v.app_id = (j.payload->>'appUuid')::uuid
               AND v.version = (j.payload->>'version')::int
               AND v.status <> ALL(?::text[])
               AND v.status_updated_at < now() - ?::interval`,
            [[...terminalStatuses], threshold],
        );
        return result.rowCount ?? 0;
    }
}
