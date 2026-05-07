import {
    NotFoundError,
    type AppVersionResources,
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
import { OrganizationTableName } from '../database/entities/organizations';
import { PinnedAppTableName } from '../database/entities/pinnedList';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
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
            Partial<
                Pick<DbApp, 'app_id' | 'name' | 'description' | 'template'>
            >,
        version: Pick<DbAppVersion, 'version' | 'prompt'>,
        status: AppVersionStatus,
        resources?: AppVersionResources,
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
                    ...(resources
                        ? {
                              resources: JSON.stringify(
                                  resources,
                              ) as unknown as AppVersionResources,
                          }
                        : {}),
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

    /**
     * Bump status_updated_at without changing any other fields, but only if
     * the version is still in progress. Used as a wall-clock heartbeat so
     * that releaseStaleLocks doesn't force-release a healthy job whose
     * current stage has gone quiet (e.g. Claude composing a single large
     * Write tool call). Returns true if the row was bumped.
     */
    async touchVersionIfInProgress(
        appId: string,
        version: number,
    ): Promise<boolean> {
        const updatedRows = await this.database(AppVersionsTableName)
            .where({ app_id: appId, version })
            .whereNotIn('status', [...APP_VERSION_TERMINAL_STATUSES])
            .update({
                status_updated_at: this.database.fn.now() as unknown as Date,
            });
        return updatedRows > 0;
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

    async getApp(
        appId: string,
        projectUuid: string,
    ): Promise<
        DbApp & {
            organization_uuid: string;
            pinned_list_uuid: string | null;
            pinned_list_order: number | null;
        }
    > {
        const row = await this.findApp(appId, projectUuid);
        if (!row) {
            throw new NotFoundError(`App not found: ${appId}`);
        }
        return row;
    }

    async findApp(
        appId: string,
        projectUuid: string,
    ): Promise<
        | (DbApp & {
              organization_uuid: string;
              pinned_list_uuid: string | null;
              pinned_list_order: number | null;
          })
        | undefined
    > {
        return this.database(AppsTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${AppsTableName}.project_uuid`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .leftJoin(
                PinnedAppTableName,
                `${PinnedAppTableName}.app_uuid`,
                `${AppsTableName}.app_id`,
            )
            .where(`${AppsTableName}.app_id`, appId)
            .andWhere(`${AppsTableName}.project_uuid`, projectUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .select<
                (DbApp & {
                    organization_uuid: string;
                    pinned_list_uuid: string | null;
                    pinned_list_order: number | null;
                })[]
            >(
                `${AppsTableName}.*`,
                `${OrganizationTableName}.organization_uuid`,
                `${PinnedAppTableName}.pinned_list_uuid`,
                `${PinnedAppTableName}.order as pinned_list_order`,
            )
            .first();
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

    async appImageExists(appId: string, imageId: string): Promise<boolean> {
        const row = await this.database(AppVersionsTableName)
            .where('app_id', appId)
            .whereRaw(`resources->'images' @> ?::jsonb`, [
                JSON.stringify([{ imageId }]),
            ])
            .select(this.database.raw('1'))
            .first();
        return !!row;
    }

    async createVersion(
        appId: string,
        version: Pick<DbAppVersion, 'version' | 'prompt'>,
        status: AppVersionStatus,
        createdByUserUuid: string,
        resources?: AppVersionResources,
    ): Promise<DbAppVersion> {
        const [row] = await this.database(AppVersionsTableName)
            .insert({
                ...version,
                app_id: appId,
                status,
                created_by_user_uuid: createdByUserUuid,
                ...(resources
                    ? {
                          resources: JSON.stringify(
                              resources,
                          ) as unknown as AppVersionResources,
                      }
                    : {}),
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
        organizationUuid: string;
        spaceUuid: string | null;
        template: DbApp['template'];
        pinnedListUuid: string | null;
        pinnedListOrder: number | null;
        versions: DbAppVersion[];
        hasMore: boolean;
    }> {
        const limit = opts.limit ?? 20;
        const query = this.database(AppsTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${AppsTableName}.project_uuid`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .leftJoin(
                AppVersionsTableName,
                `${AppsTableName}.app_id`,
                `${AppVersionsTableName}.app_id`,
            )
            .leftJoin(
                PinnedAppTableName,
                `${PinnedAppTableName}.app_uuid`,
                `${AppsTableName}.app_id`,
            )
            .where(`${AppsTableName}.app_id`, appId)
            .andWhere(`${AppsTableName}.project_uuid`, projectUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .select(
                `${AppVersionsTableName}.*`,
                `${AppsTableName}.name`,
                `${AppsTableName}.description`,
                `${AppsTableName}.created_by_user_uuid`,
                `${AppsTableName}.space_uuid`,
                `${AppsTableName}.template`,
                `${OrganizationTableName}.organization_uuid`,
                `${PinnedAppTableName}.pinned_list_uuid`,
                `${PinnedAppTableName}.order as pinned_list_order`,
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
            space_uuid: string | null;
            template: DbApp['template'];
            organization_uuid: string;
            pinned_list_uuid: string | null;
            pinned_list_order: number | null;
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
            space_uuid: spaceUuid,
            template,
            organization_uuid: organizationUuid,
            pinned_list_uuid: pinnedListUuid,
            pinned_list_order: pinnedListOrder,
        } = rows[0];

        // If app exists but no versions match, we get one row with all nulls
        const versions = rows.filter(
            (
                r,
            ): r is DbAppVersion & {
                name: string;
                description: string;
                created_by_user_uuid: string;
                space_uuid: string | null;
                template: DbApp['template'];
                organization_uuid: string;
                pinned_list_uuid: string | null;
                pinned_list_order: number | null;
            } => r.version !== null,
        );
        const hasMore = versions.length > limit;
        return {
            name,
            description,
            createdByUserUuid,
            organizationUuid,
            spaceUuid,
            template,
            pinnedListUuid,
            pinnedListOrder,
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

    /**
     * Atomically set auto-generated name/description, but only for fields
     * that are still at their empty-string default. Used by the background
     * pipeline so it cannot clobber edits the user made while the build
     * was running.
     */
    async setMetadataIfUnset(
        appId: string,
        projectUuid: string,
        metadata: { name: string; description: string },
    ): Promise<DbApp> {
        const [row] = await this.database(AppsTableName)
            .where({ app_id: appId, project_uuid: projectUuid })
            .whereNull('deleted_at')
            .update({
                name: this.database.raw(
                    `CASE WHEN ${AppsTableName}.name = '' THEN ? ELSE ${AppsTableName}.name END`,
                    [metadata.name],
                ) as unknown as string,
                description: this.database.raw(
                    `CASE WHEN ${AppsTableName}.description = '' THEN ? ELSE ${AppsTableName}.description END`,
                    [metadata.description],
                ) as unknown as string,
            })
            .returning('*');
        if (!row) {
            throw new NotFoundError(`App not found: ${appId}`);
        }
        return row;
    }

    async moveToSpace(
        {
            appId,
            projectUuid,
            targetSpaceUuid,
        }: {
            appId: string;
            projectUuid: string;
            targetSpaceUuid: string;
        },
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<void> {
        const space = await tx(SpaceTableName)
            .select(`${SpaceTableName}.space_uuid`)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(`${SpaceTableName}.space_uuid`, targetSpaceUuid)
            .andWhere(`${ProjectTableName}.project_uuid`, projectUuid)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .first();
        if (!space) {
            throw new NotFoundError('Space not found');
        }

        const updated = await tx(AppsTableName)
            .where({ app_id: appId, project_uuid: projectUuid })
            .whereNull('deleted_at')
            .update({ space_uuid: targetSpaceUuid });
        if (updated === 0) {
            throw new NotFoundError(`App not found: ${appId}`);
        }
    }

    async listMyApps(
        userUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<
        KnexPaginatedData<
            {
                app: DbApp;
                projectName: string;
                spaceName: string | null;
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
            .leftJoin(SpaceTableName, function joinSpaces() {
                this.on(
                    `${AppsTableName}.space_uuid`,
                    `${SpaceTableName}.space_uuid`,
                ).andOnNull(`${SpaceTableName}.deleted_at`);
            })
            .where(`${AppsTableName}.created_by_user_uuid`, userUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .select(
                `${AppsTableName}.*`,
                `${ProjectTableName}.name as project_name`,
                `${SpaceTableName}.name as space_name`,
                `${AppVersionsTableName}.version as last_version`,
                `${AppVersionsTableName}.status as last_version_status`,
            )
            .orderBy(`${AppsTableName}.created_at`, 'desc');

        const result = await KnexPaginate.paginate(query, paginateArgs);

        type RowWithVersion = DbApp & {
            project_name: string;
            space_name: string | null;
            last_version: number | null;
            last_version_status: string | null;
        };

        const rows = result.data as unknown as RowWithVersion[];

        return {
            data: rows.map(
                ({
                    project_name,
                    space_name,
                    last_version,
                    last_version_status,
                    ...app
                }) => ({
                    app,
                    projectName: project_name,
                    spaceName: space_name,
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

    async softDelete(
        appId: string,
        projectUuid: string,
        deletedByUserUuid: string,
    ): Promise<void> {
        const updated = await this.database(AppsTableName)
            .where({ app_id: appId, project_uuid: projectUuid })
            .whereNull('deleted_at')
            .update({
                deleted_at: this.database.fn.now() as unknown as Date,
                deleted_by_user_uuid: deletedByUserUuid,
            });
        if (updated === 0) {
            throw new NotFoundError(`App not found: ${appId}`);
        }
    }

    async permanentDelete(appId: string, projectUuid: string): Promise<void> {
        // app_versions rows cascade via FK (ON DELETE CASCADE).
        const deleted = await this.database(AppsTableName)
            .where({ app_id: appId, project_uuid: projectUuid })
            .delete();
        if (deleted === 0) {
            throw new NotFoundError(`App not found: ${appId}`);
        }
    }

    /**
     * Fetch an app regardless of soft-delete state. Used by restore and by
     * cascading permanent-delete (where the app row is already soft-deleted
     * from a prior cascade step).
     */
    async getAppIncludingDeleted(
        appId: string,
        projectUuid: string,
    ): Promise<DbApp & { organization_uuid: string }> {
        const row = await this.database(AppsTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${AppsTableName}.project_uuid`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .where(`${AppsTableName}.app_id`, appId)
            .andWhere(`${AppsTableName}.project_uuid`, projectUuid)
            .select<(DbApp & { organization_uuid: string })[]>(
                `${AppsTableName}.*`,
                `${OrganizationTableName}.organization_uuid`,
            )
            .first();
        if (!row) {
            throw new NotFoundError(`App not found: ${appId}`);
        }
        return row;
    }

    async restore(appId: string, projectUuid: string): Promise<void> {
        const updated = await this.database(AppsTableName)
            .where({ app_id: appId, project_uuid: projectUuid })
            .whereNotNull('deleted_at')
            .update({
                deleted_at: null,
                deleted_by_user_uuid: null,
            });
        if (updated === 0) {
            throw new NotFoundError(`Deleted app not found: ${appId}`);
        }
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
