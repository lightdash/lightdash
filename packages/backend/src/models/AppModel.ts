import {
    AlreadyExistsError,
    APP_VERSION_CANCELLED_BY_USER,
    DATA_APP_VIZ_TEMPLATE,
    DEFAULT_DATA_APP_CLAUDE_MODEL,
    generateSlug,
    NotFoundError,
    ProjectType,
    type AppVersionDependencies,
    type AppVersionResources,
    type AppVersionStatusHistoryEntryKind,
    type DataAppActivityFilters,
    type DataAppGenerationUsage,
    type DataAppVizSchema,
    type KnexPaginateArgs,
    type KnexPaginatedData,
} from '@lightdash/common';
import { Knex } from 'knex';
import { validate as isValidUuid, v4 as uuidv4 } from 'uuid';
import {
    APP_VERSION_TERMINAL_STATUSES,
    AppsTableName,
    AppVersionsTableName,
    isAppVersionInProgress,
    type AppVersionStatus,
    type DbApp,
    type DbAppActivityRow,
    type DbAppVersion,
} from '../database/entities/apps';
import {
    DashboardsTableName,
    DashboardTileDataAppsTableName,
    DashboardTilesTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import { OrganizationTableName } from '../database/entities/organizations';
import { PinnedAppTableName } from '../database/entities/pinnedList';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';
import {
    acquireProjectSlugLock,
    generateUniqueSlugScopedToProject,
} from '../utils/SlugUtils';

type AppModelArguments = {
    database: Knex;
};

const AppSlugSequence = 'apps_slug_sequence';

type AppWithOrgAndPin = DbApp & {
    organization_uuid: string;
    pinned_list_uuid: string | null;
    pinned_list_order: number | null;
};

export class AppModel {
    private readonly database: Knex;

    constructor({ database }: AppModelArguments) {
        this.database = database;
    }

    async createWithVersion(
        app: Pick<DbApp, 'project_uuid' | 'created_by_user_uuid'> &
            Partial<
                Pick<
                    DbApp,
                    | 'app_id'
                    | 'slug'
                    | 'name'
                    | 'description'
                    | 'template'
                    | 'space_uuid'
                    | 'design_uuid'
                >
            >,
        version: Pick<DbAppVersion, 'version' | 'prompt'>,
        status: AppVersionStatus,
        resources?: AppVersionResources,
        dependencies?: AppVersionDependencies,
        vizSchema?: DataAppVizSchema,
        // forceSlug (as-code upload round-trip): use app.slug verbatim and
        // fail loudly on a conflict, so re-uploads stay idempotent instead of
        // silently minting suffixed duplicates. Default: app.slug is a base
        // hint — normalized and dedupe-suffixed (duplication derives copies'
        // slugs from the source slug this way).
        opts?: { forceSlug?: boolean },
    ): Promise<{ app: DbApp; version: DbAppVersion }> {
        return this.database.transaction(async (trx) => {
            const appId = app.app_id ?? uuidv4();
            let slug: string;
            if (opts?.forceSlug && app.slug !== undefined) {
                // Serialize racing creates on the same (project, slug), then
                // check for a holder — including soft-deleted apps, which
                // still occupy the unique constraint.
                await acquireProjectSlugLock(trx, app.project_uuid, app.slug);
                const slugHolder = await trx(AppsTableName)
                    .where({ project_uuid: app.project_uuid, slug: app.slug })
                    .first();
                if (slugHolder) {
                    throw new AlreadyExistsError(
                        `A data app with slug "${app.slug}" already exists in this project (it may be soft-deleted). Re-run the upload to append, or restore/permanently delete the conflicting app.`,
                    );
                }
                slug = app.slug;
            } else {
                const appName = app.name ?? '';
                const hasSlugName = /[a-z0-9]/i.test(appName);
                const slugSource =
                    app.slug ??
                    (hasSlugName
                        ? appName
                        : (
                              await trx.raw<{
                                  rows: Array<{ slug: string }>;
                              }>(`SELECT 'app-' || nextval(?)::text AS slug`, [
                                  AppSlugSequence,
                              ])
                          ).rows[0].slug);
                const baseSlug = generateSlug(slugSource).slice(0, 255);
                await acquireProjectSlugLock(trx, app.project_uuid, baseSlug);
                slug = await generateUniqueSlugScopedToProject(
                    trx,
                    app.project_uuid,
                    AppsTableName,
                    baseSlug,
                );
            }
            const [appRow] = await trx(AppsTableName)
                .insert({
                    ...app,
                    app_id: appId,
                    slug,
                })
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
                    ...(dependencies
                        ? {
                              dependencies: JSON.stringify(
                                  dependencies,
                              ) as unknown as AppVersionDependencies,
                          }
                        : {}),
                    ...(vizSchema
                        ? {
                              viz_schema: JSON.stringify(
                                  vizSchema,
                              ) as unknown as DataAppVizSchema,
                          }
                        : {}),
                })
                .returning('*');
            return { app: appRow, version: versionRow };
        });
    }

    /**
     * Cap on status_history entries per version. Snippet updates are
     * throttled to one per ~3s upstream, so normal builds stay well under
     * this; the cap only guards pathological runs (long retries against the
     * 55-min sandbox timeout) from growing the row without bound. Once hit,
     * new messages still update status_message but stop being recorded.
     */
    private static readonly MAX_STATUS_HISTORY_ENTRIES = 500;

    /** SQL expression appending one entry to status_history, respecting the cap. */
    private statusHistoryAppend(
        message: string,
        kind: AppVersionStatusHistoryEntryKind,
    ): DbAppVersion['status_history'] {
        return this.database.raw(
            `CASE WHEN jsonb_array_length(status_history) < ? THEN status_history || ?::jsonb ELSE status_history END`,
            [
                AppModel.MAX_STATUS_HISTORY_ENTRIES,
                JSON.stringify([
                    { message, timestamp: new Date().toISOString(), kind },
                ]),
            ],
        ) as unknown as DbAppVersion['status_history'];
    }

    /**
     * Record what the version's generation cost. Called once the pipeline
     * reaches a terminal state, on both the success and failure paths — a
     * generation that failed halfway still spent what it spent.
     *
     * Adds to any spend already recorded rather than replacing it. A version's
     * pipeline can run more than once: when a job is retried the resumed
     * `--continue` leg reports only its own usage, so overwriting would leave
     * the row showing the tail of the work instead of all of it. Accumulating
     * in SQL keeps it a single atomic statement, with no read-modify-write race
     * between concurrent legs.
     */
    async recordVersionGenerationUsage(
        appId: string,
        version: number,
        usage: DataAppGenerationUsage,
    ): Promise<void> {
        const sum = (field: keyof DataAppGenerationUsage) =>
            `COALESCE((generation_usage->>'${field}')::numeric, 0) + ?`;
        await this.database(AppVersionsTableName)
            .where({ app_id: appId, version })
            .update({
                generation_usage: this.database.raw(
                    `jsonb_build_object(
                        'inputTokens', ${sum('inputTokens')},
                        'outputTokens', ${sum('outputTokens')},
                        'cacheReadInputTokens', ${sum('cacheReadInputTokens')},
                        'cacheCreationInputTokens', ${sum(
                            'cacheCreationInputTokens',
                        )},
                        'numTurns', ${sum('numTurns')},
                        'durationApiMs', ${sum('durationApiMs')},
                        'costUsd', ${sum('costUsd')}
                    )`,
                    [
                        usage.inputTokens,
                        usage.outputTokens,
                        usage.cacheReadInputTokens,
                        usage.cacheCreationInputTokens,
                        usage.numTurns,
                        usage.durationApiMs,
                        usage.costUsd,
                    ],
                ) as unknown as DataAppGenerationUsage,
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
     *
     * Stage messages for non-terminal transitions are also appended to the
     * status_history narration log. Terminal messages are not — the final
     * completion message lives in status_message and is rendered as the
     * assistant reply, not as part of the build narration.
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
                ...(statusMessage && isAppVersionInProgress(status)
                    ? {
                          status_history: this.statusHistoryAppend(
                              statusMessage,
                              'stage',
                          ),
                      }
                    : {}),
                status_updated_at: this.database.fn.now() as unknown as Date,
            });
        return updatedRows > 0;
    }

    /**
     * Plain status_message setter with no in-progress guard — used by flows
     * that stamp a message on an already-terminal version (restore, promote,
     * duplicate). Build pipelines must use `recordBuildNarration` instead.
     */
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
     * Record a live narration message for an in-progress build: overwrites
     * status_message and (when `kind` is non-null) appends to the
     * status_history log. `kind: null` is for transient placeholders (e.g.
     * "Thinking") that should show as the live status but aren't worth
     * keeping in the transcript. No-ops once the version reached a terminal
     * state, so a late fire-and-forget write from the generation stream
     * can't clobber the final completion message.
     */
    async recordBuildNarration(
        appId: string,
        version: number,
        statusMessage: string,
        kind: AppVersionStatusHistoryEntryKind | null,
    ): Promise<void> {
        await this.database(AppVersionsTableName)
            .where({ app_id: appId, version })
            .whereNotIn('status', [...APP_VERSION_TERMINAL_STATUSES])
            .update({
                status_message: statusMessage,
                ...(kind
                    ? {
                          status_history: this.statusHistoryAppend(
                              statusMessage,
                              kind,
                          ),
                      }
                    : {}),
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
    ): Promise<AppWithOrgAndPin> {
        const row = await this.findApp(appId, projectUuid);
        if (!row) {
            throw new NotFoundError(`App not found: ${appId}`);
        }
        return row;
    }

    /**
     * Shared joins/select for the app + its organization + its pinned-list
     * placement, underlying `findApp`, `findAppBySlug`, and
     * `findAppByUuidOrSlug`. Callers add their own where-clauses.
     */
    private appWithOrgAndPinQuery() {
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
            .select<AppWithOrgAndPin[]>(
                `${AppsTableName}.*`,
                `${OrganizationTableName}.organization_uuid`,
                `${PinnedAppTableName}.pinned_list_uuid`,
                `${PinnedAppTableName}.order as pinned_list_order`,
            );
    }

    async findAppByUuid(appId: string): Promise<
        | (DbApp & {
              organization_uuid: string;
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
            .where(`${AppsTableName}.app_id`, appId)
            .whereNull(`${AppsTableName}.deleted_at`)
            .select<
                (DbApp & {
                    organization_uuid: string;
                })[]
            >(
                `${AppsTableName}.*`,
                `${OrganizationTableName}.organization_uuid`,
            )
            .first();
    }

    async findApp(
        appId: string,
        projectUuid: string,
    ): Promise<AppWithOrgAndPin | undefined> {
        return this.appWithOrgAndPinQuery()
            .where(`${AppsTableName}.app_id`, appId)
            .andWhere(`${AppsTableName}.project_uuid`, projectUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .first();
    }

    async findAppBySlug(
        projectUuid: string,
        slug: string,
    ): Promise<AppWithOrgAndPin | undefined> {
        return this.appWithOrgAndPinQuery()
            .where(`${AppsTableName}.slug`, slug)
            .andWhere(`${AppsTableName}.project_uuid`, projectUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .first();
    }

    /**
     * Resolve an app by uuid or slug. A value that parses as a UUID may
     * still be a slug (slugs aren't guaranteed non-uuid-shaped), so
     * uuid-shaped input matches either column; non-uuid input matches slug
     * only. Mirrors `DashboardModel.getByIdOrSlug`'s resolution.
     */
    async findAppByUuidOrSlug(
        projectUuid: string,
        appUuidOrSlug: string,
    ): Promise<AppWithOrgAndPin | undefined> {
        const query = this.appWithOrgAndPinQuery()
            .andWhere(`${AppsTableName}.project_uuid`, projectUuid)
            .whereNull(`${AppsTableName}.deleted_at`);
        if (isValidUuid(appUuidOrSlug)) {
            void query.where((builder) => {
                void builder
                    .where(`${AppsTableName}.app_id`, appUuidOrSlug)
                    .orWhere(`${AppsTableName}.slug`, appUuidOrSlug);
            });
        } else {
            void query.where(`${AppsTableName}.slug`, appUuidOrSlug);
        }
        return query.first();
    }

    async getAppByUuidOrSlug(
        projectUuid: string,
        appUuidOrSlug: string,
    ): Promise<AppWithOrgAndPin> {
        const row = await this.findAppByUuidOrSlug(projectUuid, appUuidOrSlug);
        if (!row) {
            throw new NotFoundError(`App not found: ${appUuidOrSlug}`);
        }
        return row;
    }

    /** Versions that declared custom dependencies, newest first. */
    async getVersionsWithDependencies(
        appId: string,
    ): Promise<Pick<DbAppVersion, 'version' | 'dependencies'>[]> {
        return this.database(AppVersionsTableName)
            .select('version', 'dependencies')
            .where('app_id', appId)
            .whereNotNull('dependencies')
            .orderBy('version', 'desc');
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

    /**
     * Whether any version between the latest ready version and `beforeVersion`
     * (both exclusive) was cancelled by the user. The persistent Claude session
     * of a resumed sandbox still ends with a cancelled instruction until a
     * later generation supersedes it, so the pipeline uses this to decide
     * whether to disavow that instruction in the next prompt.
     */
    async hasCancelledVersionSinceLastReady(
        appId: string,
        beforeVersion: number,
    ): Promise<boolean> {
        const lastReady = await this.database(AppVersionsTableName)
            .where({ app_id: appId, status: 'ready' })
            .max('version as version')
            .first<{ version: number | null }>();
        const cancelled = await this.database(AppVersionsTableName)
            .where({
                app_id: appId,
                status: 'error',
                error: APP_VERSION_CANCELLED_BY_USER,
            })
            .andWhere('version', '>', lastReady?.version ?? 0)
            .andWhere('version', '<', beforeVersion)
            .select('version')
            .first();
        return cancelled !== undefined;
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
        dependencies?: AppVersionDependencies,
        vizSchema?: DataAppVizSchema,
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
                ...(dependencies
                    ? {
                          dependencies: JSON.stringify(
                              dependencies,
                          ) as unknown as AppVersionDependencies,
                      }
                    : {}),
                ...(vizSchema
                    ? {
                          viz_schema: JSON.stringify(
                              vizSchema,
                          ) as unknown as DataAppVizSchema,
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
        spaceName: string | null;
        template: DbApp['template'];
        pinnedListUuid: string | null;
        pinnedListOrder: number | null;
        versions: (DbAppVersion & {
            created_by_user_first_name: string | null;
            created_by_user_last_name: string | null;
        })[];
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
            // LEFT JOIN: surfaces the version author's display name to the
            // chat UI. We don't filter `is_internal` / `is_active` because
            // service accounts cannot create app versions today; if a row's
            // user is hard-deleted the join misses and the service layer
            // collapses `createdByUser` to null.
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${AppVersionsTableName}.created_by_user_uuid`,
            )
            .leftJoin(
                PinnedAppTableName,
                `${PinnedAppTableName}.app_uuid`,
                `${AppsTableName}.app_id`,
            )
            .leftJoin(SpaceTableName, function spaceJoin() {
                void this.on(
                    `${SpaceTableName}.space_uuid`,
                    '=',
                    `${AppsTableName}.space_uuid`,
                ).andOnNull(`${SpaceTableName}.deleted_at`);
            })
            .where(`${AppsTableName}.app_id`, appId)
            .andWhere(`${AppsTableName}.project_uuid`, projectUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .select(
                `${AppVersionsTableName}.*`,
                `${AppsTableName}.name`,
                `${AppsTableName}.description`,
                `${AppsTableName}.created_by_user_uuid`,
                `${AppsTableName}.space_uuid`,
                `${SpaceTableName}.name as space_name`,
                `${AppsTableName}.template`,
                `${OrganizationTableName}.organization_uuid`,
                `${PinnedAppTableName}.pinned_list_uuid`,
                `${PinnedAppTableName}.order as pinned_list_order`,
                `${UserTableName}.first_name as created_by_user_first_name`,
                `${UserTableName}.last_name as created_by_user_last_name`,
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
            space_name: string | null;
            template: DbApp['template'];
            organization_uuid: string;
            pinned_list_uuid: string | null;
            pinned_list_order: number | null;
            created_by_user_first_name: string | null;
            created_by_user_last_name: string | null;
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
            space_name: spaceName,
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
                space_name: string | null;
                template: DbApp['template'];
                organization_uuid: string;
                pinned_list_uuid: string | null;
                pinned_list_order: number | null;
                created_by_user_first_name: string | null;
                created_by_user_last_name: string | null;
            } => r.version !== null,
        );
        const hasMore = versions.length > limit;
        return {
            name,
            description,
            createdByUserUuid,
            organizationUuid,
            spaceUuid,
            spaceName,
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

    async updateDesignUuid(
        appId: string,
        projectUuid: string,
        designUuid: string | null,
    ): Promise<DbApp> {
        const [row] = await this.database(AppsTableName)
            .where({ app_id: appId, project_uuid: projectUuid })
            .whereNull('deleted_at')
            .update({ design_uuid: designUuid })
            .returning('*');
        if (!row) {
            throw new NotFoundError(`App not found: ${appId}`);
        }
        return row;
    }

    /**
     * Record that a preview app has been promoted into a production app. The
     * link lives on the preview (source) row so one production app can be the
     * upstream of many preview apps. Setting it is idempotent — re-promoting
     * the same preview app just rewrites the same value.
     */
    async setUpstreamAppUuid(
        appId: string,
        upstreamAppUuid: string,
    ): Promise<void> {
        await this.database(AppsTableName)
            .where({ app_id: appId })
            .update({ upstream_app_uuid: upstreamAppUuid });
    }

    /**
     * List every non-deleted app in a project. Used by preview duplication to
     * mirror the upstream project's apps into a freshly created preview.
     */
    async listAppsByProject(projectUuid: string): Promise<DbApp[]> {
        return this.database(AppsTableName)
            .where({ project_uuid: projectUuid })
            .whereNull('deleted_at')
            .select('*');
    }

    // Derived table of each app's latest ready version number, for joining the
    // latest ready version's schema onto a data app viz.
    private latestReadyVersions() {
        return this.database(AppVersionsTableName)
            .select('app_id')
            .max({ version: 'version' })
            .where('status', 'ready')
            .groupBy('app_id')
            .as('lrv');
    }

    private joinLatestReadyVersion(
        query: Knex.QueryBuilder,
    ): Knex.QueryBuilder {
        return query
            .leftJoin(
                this.latestReadyVersions(),
                `${AppsTableName}.app_id`,
                'lrv.app_id',
            )
            .leftJoin(AppVersionsTableName, function joinVersion() {
                this.on(
                    `${AppsTableName}.app_id`,
                    `${AppVersionsTableName}.app_id`,
                ).andOn('lrv.version', `${AppVersionsTableName}.version`);
            });
    }

    /**
     * A page of the project's bindable data app vizs — only those whose latest
     * ready version has generated a schema, so pagination counts are exact.
     */
    async listDataAppVisualizations(
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
        search?: string,
    ): Promise<
        KnexPaginatedData<(DbApp & { viz_schema: DataAppVizSchema })[]>
    > {
        const query = this.joinLatestReadyVersion(this.database(AppsTableName))
            .where({
                [`${AppsTableName}.project_uuid`]: projectUuid,
                [`${AppsTableName}.template`]: DATA_APP_VIZ_TEMPLATE,
            })
            .whereNull(`${AppsTableName}.deleted_at`)
            .whereNotNull(`${AppVersionsTableName}.viz_schema`)
            .select<(DbApp & { viz_schema: DataAppVizSchema })[]>(
                `${AppsTableName}.*`,
                `${AppVersionsTableName}.viz_schema`,
            )
            .orderBy(`${AppsTableName}.created_at`, 'desc');
        if (search) {
            void query.whereILike(`${AppsTableName}.name`, `%${search}%`);
        }
        return KnexPaginate.paginate(query, paginateArgs);
    }

    /**
     * Fetch a single data app viz by id, with its organization uuid (for the
     * view permission check) and latest schema. Undefined when the id is not a
     * data app viz in this project.
     */
    async findVisualizationApp(
        dataAppVizUuid: string,
        projectUuid: string,
    ): Promise<
        | (DbApp & {
              organization_uuid: string;
              viz_schema: DataAppVizSchema | null;
          })
        | undefined
    > {
        return this.joinLatestReadyVersion(this.database(AppsTableName))
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
            .where(`${AppsTableName}.app_id`, dataAppVizUuid)
            .andWhere(`${AppsTableName}.project_uuid`, projectUuid)
            .andWhere(`${AppsTableName}.template`, DATA_APP_VIZ_TEMPLATE)
            .whereNull(`${AppsTableName}.deleted_at`)
            .select<
                (DbApp & {
                    organization_uuid: string;
                    viz_schema: DataAppVizSchema | null;
                })[]
            >(
                `${AppsTableName}.*`,
                `${OrganizationTableName}.organization_uuid`,
                `${AppVersionsTableName}.viz_schema`,
            )
            .first();
    }

    // Persist the schema generated for a data app viz on its version row.
    async setSchema(
        appId: string,
        version: number,
        schema: DataAppVizSchema,
    ): Promise<void> {
        await this.database(AppVersionsTableName)
            .where({ app_id: appId, version })
            .update({
                viz_schema: JSON.stringify(
                    schema,
                ) as unknown as DataAppVizSchema,
            });
    }

    /**
     * Repoint a preview project's data-app dashboard tiles from the source
     * (upstream) apps they were copied with onto the preview's own duplicated
     * apps. The update is scoped to dashboards living in the preview project so
     * the upstream project's tiles — which carry the same `app_uuid` — are
     * never touched.
     */
    async remapPreviewDashboardTileApps(
        previewProjectUuid: string,
        mappings: { sourceAppUuid: string; previewAppUuid: string }[],
    ): Promise<void> {
        if (mappings.length === 0) {
            return;
        }
        const previewVersionIds = this.database(DashboardVersionsTableName)
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, previewProjectUuid)
            .select(`${DashboardVersionsTableName}.dashboard_version_id`);

        /* eslint-disable no-await-in-loop */
        for (const { sourceAppUuid, previewAppUuid } of mappings) {
            await this.database(DashboardTileDataAppsTableName)
                .where('app_uuid', sourceAppUuid)
                .whereIn('dashboard_version_id', previewVersionIds.clone())
                .update({ app_uuid: previewAppUuid });
        }
        /* eslint-enable no-await-in-loop */
    }

    /**
     * Sync the metadata of an existing production app from its preview source
     * during a follow-up promotion. Only touches the fields promotion owns —
     * versions are appended separately, the link and ownership stay put.
     */
    async syncPromotedApp(
        appId: string,
        update: Pick<
            DbApp,
            'name' | 'description' | 'space_uuid' | 'design_uuid'
        >,
    ): Promise<DbApp> {
        const [row] = await this.database(AppsTableName)
            .where({ app_id: appId })
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
        options: {
            excludePreviewProjects?: boolean;
            projectUuids?: string[];
            search?: string;
        } = {},
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
            .modify((queryBuilder) => {
                if (options.excludePreviewProjects ?? true) {
                    void queryBuilder.whereNot(
                        `${ProjectTableName}.project_type`,
                        ProjectType.PREVIEW,
                    );
                }

                if (options.projectUuids?.length) {
                    void queryBuilder.whereIn(
                        `${AppsTableName}.project_uuid`,
                        options.projectUuids,
                    );
                }

                const search = options.search?.trim();
                if (search) {
                    void queryBuilder.where((searchQueryBuilder) => {
                        void searchQueryBuilder
                            .whereILike(`${AppsTableName}.name`, `%${search}%`)
                            .orWhereILike(
                                `${ProjectTableName}.name`,
                                `%${search}%`,
                            )
                            .orWhereILike(
                                `${SpaceTableName}.name`,
                                `%${search}%`,
                            );
                    });
                }
            })
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

    /**
     * A page of every data app generation across the organization, newest
     * first. One row per `app_versions` row, so it covers new apps, iterations,
     * and failed generations alike.
     *
     * Deliberately does NOT filter `apps.deleted_at`: this is an audit trail,
     * and deleting an app must not erase the record of who generated what.
     */
    async getOrganizationActivity(
        organizationUuid: string,
        paginateArgs?: KnexPaginateArgs,
        filters?: DataAppActivityFilters,
    ): Promise<KnexPaginatedData<DbAppActivityRow[]>> {
        const query = this.database(AppVersionsTableName)
            .innerJoin(
                AppsTableName,
                `${AppsTableName}.app_id`,
                `${AppVersionsTableName}.app_id`,
            )
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
            // LEFT JOIN so a hard-deleted author doesn't drop their generations
            // from the log; the service collapses the missing row to null.
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${AppVersionsTableName}.created_by_user_uuid`,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .modify((queryBuilder) => {
                if (filters?.projectUuids?.length) {
                    void queryBuilder.whereIn(
                        `${AppsTableName}.project_uuid`,
                        filters.projectUuids,
                    );
                }
                if (filters?.userUuids?.length) {
                    void queryBuilder.whereIn(
                        `${AppVersionsTableName}.created_by_user_uuid`,
                        filters.userUuids,
                    );
                }
                if (filters?.models?.length) {
                    const { models } = filters;
                    void queryBuilder.where((modelQueryBuilder) => {
                        void modelQueryBuilder.whereRaw(
                            `${AppVersionsTableName}.resources->>'claudeModel' IN (${models
                                .map(() => '?')
                                .join(', ')})`,
                            models,
                        );
                        // A version with no stored model ran on the default, and
                        // that is what the API reports for it — so filtering on
                        // the default has to match those rows too, or the filter
                        // contradicts the value shown in the row.
                        if (models.includes(DEFAULT_DATA_APP_CLAUDE_MODEL)) {
                            void modelQueryBuilder.orWhereRaw(
                                `${AppVersionsTableName}.resources->>'claudeModel' IS NULL`,
                            );
                        }
                    });
                }
                if (filters?.dateFrom) {
                    void queryBuilder.where(
                        `${AppVersionsTableName}.created_at`,
                        '>=',
                        filters.dateFrom,
                    );
                }
                if (filters?.dateTo) {
                    void queryBuilder.where(
                        `${AppVersionsTableName}.created_at`,
                        '<=',
                        filters.dateTo,
                    );
                }
            })
            .select<DbAppActivityRow[]>(
                `${AppVersionsTableName}.app_id`,
                `${AppVersionsTableName}.version`,
                `${AppVersionsTableName}.prompt`,
                `${AppVersionsTableName}.status`,
                `${AppVersionsTableName}.resources`,
                `${AppVersionsTableName}.generation_usage`,
                `${AppVersionsTableName}.created_at`,
                `${AppVersionsTableName}.created_by_user_uuid`,
                `${AppsTableName}.name as app_name`,
                `${AppsTableName}.deleted_at as app_deleted_at`,
                `${AppsTableName}.project_uuid`,
                `${ProjectTableName}.name as project_name`,
                `${UserTableName}.first_name as created_by_user_first_name`,
                `${UserTableName}.last_name as created_by_user_last_name`,
            )
            // app_id/version tie-break keeps pagination stable when two
            // generations share a timestamp.
            .orderBy([
                { column: `${AppVersionsTableName}.created_at`, order: 'desc' },
                { column: `${AppVersionsTableName}.app_id`, order: 'asc' },
                { column: `${AppVersionsTableName}.version`, order: 'desc' },
            ]);

        return KnexPaginate.paginate(query, paginateArgs);
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

    async updateSandboxUuid(
        appId: string,
        sandboxUuid: string | null,
    ): Promise<void> {
        await this.database(AppsTableName)
            .where({ app_id: appId })
            .update({ sandbox_id: sandboxUuid });
    }

    /**
     * Returns the UUIDs of dashboards in `projectUuid` whose latest version
     * contains a tile referencing `appUuid`. Old versions are intentionally
     * ignored: if a dashboard once contained the app but no longer does,
     * embedding that dashboard must not implicitly authorize the app.
     */
    async findDashboardsContainingApp(
        appUuid: string,
        projectUuid: string,
    ): Promise<string[]> {
        const latestVersionsCte = 'latest_dashboard_versions';
        const rows = await this.database
            .with(latestVersionsCte, (qb) => {
                void qb
                    .select({
                        dashboard_uuid: `${DashboardsTableName}.dashboard_uuid`,
                        dashboard_version_id: this.database.raw(
                            `MAX(${DashboardVersionsTableName}.dashboard_version_id)`,
                        ),
                    })
                    .from(DashboardsTableName)
                    .innerJoin(SpaceTableName, function joinSpaces() {
                        this.on(
                            `${DashboardsTableName}.space_id`,
                            '=',
                            `${SpaceTableName}.space_id`,
                        ).andOnNull(`${SpaceTableName}.deleted_at`);
                    })
                    .innerJoin(
                        ProjectTableName,
                        `${SpaceTableName}.project_id`,
                        `${ProjectTableName}.project_id`,
                    )
                    .innerJoin(
                        DashboardVersionsTableName,
                        `${DashboardsTableName}.dashboard_id`,
                        `${DashboardVersionsTableName}.dashboard_id`,
                    )
                    .where(`${ProjectTableName}.project_uuid`, projectUuid)
                    .whereNull(`${DashboardsTableName}.deleted_at`)
                    .groupBy(`${DashboardsTableName}.dashboard_uuid`);
            })
            .select<{ dashboard_uuid: string }[]>(
                `${latestVersionsCte}.dashboard_uuid`,
            )
            .distinct()
            .from(latestVersionsCte)
            .innerJoin(
                DashboardTilesTableName,
                `${DashboardTilesTableName}.dashboard_version_id`,
                `${latestVersionsCte}.dashboard_version_id`,
            )
            .innerJoin(DashboardTileDataAppsTableName, function joinTiles() {
                this.on(
                    `${DashboardTileDataAppsTableName}.dashboard_tile_uuid`,
                    '=',
                    `${DashboardTilesTableName}.dashboard_tile_uuid`,
                ).andOn(
                    `${DashboardTileDataAppsTableName}.dashboard_version_id`,
                    '=',
                    `${DashboardTilesTableName}.dashboard_version_id`,
                );
            })
            .where(`${DashboardTileDataAppsTableName}.app_uuid`, appUuid);

        return rows.map((r) => r.dashboard_uuid);
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

    async countInProgressVersionsForProject(
        projectUuid: string,
    ): Promise<number> {
        const [row] = await this.database(AppVersionsTableName)
            .join(
                AppsTableName,
                `${AppsTableName}.app_id`,
                `${AppVersionsTableName}.app_id`,
            )
            .where(`${AppsTableName}.project_uuid`, projectUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .whereNotIn('status', [...APP_VERSION_TERMINAL_STATUSES])
            .count<{ count: string }[]>({ count: '*' });
        return parseInt(row.count, 10);
    }
}
