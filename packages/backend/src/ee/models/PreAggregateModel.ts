import {
    computePreAggregateWarnings,
    NotFoundError,
    type ActiveMaterializationDetails,
    type ApiPreAggregateMaterializationsResults,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type PreAggregateDefinition,
    type PreAggregateDefinitionWithExploreName,
    type PreAggregateMaterialization,
    type PreAggregateMaterializationStatus,
    type PreAggregateMaterializationSummary,
    type PreAggregateMaterializationTrigger,
    type PreAggregateSchedulerDetails,
    type ResultColumns,
} from '@lightdash/common';
import { Knex } from 'knex';
import { CachedExploreTableName } from '../../database/entities/projects';
import KnexPaginate from '../../database/pagination';
import {
    PreAggregateDefinitionsTableName,
    PreAggregateMaterializationsTableName,
    type DbPreAggregateDefinition,
    type DbPreAggregateDefinitionIn,
    type DbPreAggregateMaterialization,
} from '../database/entities/preAggregates';

type DbPreAggregateDefinitionWithExploreName = DbPreAggregateDefinition & {
    pre_agg_explore_name: string;
};

const toPreAggregateDefinition = (
    row: DbPreAggregateDefinition,
): PreAggregateDefinition => ({
    preAggregateDefinitionUuid: row.pre_aggregate_definition_uuid,
    projectUuid: row.project_uuid,
    sourceCachedExploreUuid: row.source_cached_explore_uuid,
    preAggCachedExploreUuid: row.pre_agg_cached_explore_uuid,
    preAggregateDefinition: row.pre_aggregate_definition,
    materializationMetricQuery: row.materialization_metric_query,
    materializationQueryError: row.materialization_query_error,
    refreshCron: row.refresh_cron,
    materializeOnChange: row.materialize_on_change,
    definitionFingerprint: row.definition_fingerprint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const toPreAggregateMaterialization = (
    row: DbPreAggregateMaterialization,
): PreAggregateMaterialization => ({
    materializationUuid: row.pre_aggregate_materialization_uuid,
    projectUuid: row.project_uuid,
    preAggregateDefinitionUuid: row.pre_aggregate_definition_uuid,
    status: row.status,
    trigger: row.trigger,
    queryUuid: row.query_uuid,
    materializationUri: row.materialization_uri,
    materializedAt: row.materialized_at,
    rowCount: row.row_count,
    columns: row.columns,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

export class PreAggregateModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    /**
     * Upserts the registry rows and supersedes the active materialization of
     * every definition whose fingerprint moved, so a changed explore is never
     * served from a file built for its old shape. Rows with no stored
     * fingerprint (written before tracking) take the new one as baseline.
     * `changedDefinitionUuids` lists every definition whose fingerprint moved,
     * whether or not it had an active materialization to supersede.
     */
    async upsertPreAggregateDefinitions(
        definitions: DbPreAggregateDefinitionIn[],
    ): Promise<{
        changedDefinitionUuids: string[];
        supersededDefinitionUuids: string[];
    }> {
        if (definitions.length === 0) {
            return {
                changedDefinitionUuids: [],
                supersededDefinitionUuids: [],
            };
        }

        return this.database.transaction(async (trx) => {
            const existingRows = await trx(PreAggregateDefinitionsTableName)
                .whereIn(
                    'pre_agg_cached_explore_uuid',
                    definitions.map(
                        (definition) => definition.pre_agg_cached_explore_uuid,
                    ),
                )
                .select<
                    Pick<
                        DbPreAggregateDefinition,
                        | 'pre_aggregate_definition_uuid'
                        | 'pre_agg_cached_explore_uuid'
                        | 'definition_fingerprint'
                    >[]
                >(
                    'pre_aggregate_definition_uuid',
                    'pre_agg_cached_explore_uuid',
                    'definition_fingerprint',
                );
            const existingByExploreUuid = new Map(
                existingRows.map((row) => [
                    row.pre_agg_cached_explore_uuid,
                    row,
                ]),
            );
            const staleDefinitionUuids = definitions.flatMap((definition) => {
                const existing = existingByExploreUuid.get(
                    definition.pre_agg_cached_explore_uuid,
                );
                return existing &&
                    existing.definition_fingerprint !== null &&
                    existing.definition_fingerprint !==
                        definition.definition_fingerprint
                    ? [existing.pre_aggregate_definition_uuid]
                    : [];
            });

            await trx(PreAggregateDefinitionsTableName)
                .insert(definitions)
                .onConflict('pre_agg_cached_explore_uuid')
                .merge({
                    source_cached_explore_uuid: trx.raw(
                        'excluded.source_cached_explore_uuid',
                    ),
                    pre_aggregate_definition: trx.raw(
                        'excluded.pre_aggregate_definition',
                    ),
                    materialization_metric_query: trx.raw(
                        'excluded.materialization_metric_query',
                    ),
                    materialization_query_error: trx.raw(
                        'excluded.materialization_query_error',
                    ),
                    refresh_cron: trx.raw('excluded.refresh_cron'),
                    materialize_on_change: trx.raw(
                        'excluded.materialize_on_change',
                    ),
                    definition_fingerprint: trx.raw(
                        'excluded.definition_fingerprint',
                    ),
                    updated_at: trx.fn.now(),
                });

            if (staleDefinitionUuids.length === 0) {
                return {
                    changedDefinitionUuids: [],
                    supersededDefinitionUuids: [],
                };
            }
            const supersededRows = await trx(
                PreAggregateMaterializationsTableName,
            )
                .whereIn('pre_aggregate_definition_uuid', staleDefinitionUuids)
                .andWhere('status', 'active')
                .update({ status: 'superseded', updated_at: new Date() })
                .returning<
                    Pick<
                        DbPreAggregateMaterialization,
                        'pre_aggregate_definition_uuid'
                    >[]
                >('pre_aggregate_definition_uuid');
            return {
                changedDefinitionUuids: staleDefinitionUuids,
                supersededDefinitionUuids: Array.from(
                    new Set(
                        supersededRows.map(
                            (row) => row.pre_aggregate_definition_uuid,
                        ),
                    ),
                ),
            };
        });
    }

    async getPreAggregateDefinitionsForProject(
        projectUuid: string,
    ): Promise<PreAggregateDefinition[]> {
        const rows = await this.database(PreAggregateDefinitionsTableName)
            .where('project_uuid', projectUuid)
            .select<DbPreAggregateDefinition[]>('*');

        return rows.map(toPreAggregateDefinition);
    }

    /**
     * Definitions that have completed a materialization at least once, active
     * or since superseded. Failed and in-progress runs do not count.
     */
    async getDefinitionUuidsEverMaterialized(
        projectUuid: string,
    ): Promise<Set<string>> {
        const rows = await this.database(PreAggregateMaterializationsTableName)
            .where('project_uuid', projectUuid)
            .whereIn('status', ['active', 'superseded'])
            .distinct<
                Pick<
                    DbPreAggregateMaterialization,
                    'pre_aggregate_definition_uuid'
                >[]
            >('pre_aggregate_definition_uuid');
        return new Set(rows.map((row) => row.pre_aggregate_definition_uuid));
    }

    async getPreAggregateDefinitionByUuid(args: {
        projectUuid: string;
        preAggregateDefinitionUuid: string;
    }): Promise<PreAggregateDefinition | undefined> {
        const row = await this.database(PreAggregateDefinitionsTableName)
            .where('project_uuid', args.projectUuid)
            .andWhere(
                'pre_aggregate_definition_uuid',
                args.preAggregateDefinitionUuid,
            )
            .select<DbPreAggregateDefinition[]>('*')
            .first();

        return row ? toPreAggregateDefinition(row) : undefined;
    }

    async getPreAggregateDefinitionByName(args: {
        projectUuid: string;
        preAggExploreName: string;
    }): Promise<PreAggregateDefinitionWithExploreName | undefined> {
        const row = await this.database(PreAggregateDefinitionsTableName)
            .innerJoin(
                CachedExploreTableName,
                `${PreAggregateDefinitionsTableName}.pre_agg_cached_explore_uuid`,
                `${CachedExploreTableName}.cached_explore_uuid`,
            )
            .where(
                `${PreAggregateDefinitionsTableName}.project_uuid`,
                args.projectUuid,
            )
            .andWhere(`${CachedExploreTableName}.name`, args.preAggExploreName)
            .select<DbPreAggregateDefinitionWithExploreName[]>([
                `${PreAggregateDefinitionsTableName}.*`,
                this.database.raw(
                    `${CachedExploreTableName}.name as pre_agg_explore_name`,
                ),
            ])
            .first();

        if (!row) {
            return undefined;
        }

        return {
            ...toPreAggregateDefinition(row),
            preAggExploreName: row.pre_agg_explore_name,
        };
    }

    async getPreAggregateDefinitionByDefinitionName(args: {
        projectUuid: string;
        preAggregateDefinitionName: string;
    }): Promise<PreAggregateDefinitionWithExploreName | undefined> {
        const row = await this.database(PreAggregateDefinitionsTableName)
            .innerJoin(
                CachedExploreTableName,
                `${PreAggregateDefinitionsTableName}.pre_agg_cached_explore_uuid`,
                `${CachedExploreTableName}.cached_explore_uuid`,
            )
            .where(
                `${PreAggregateDefinitionsTableName}.project_uuid`,
                args.projectUuid,
            )
            .andWhereRaw(
                `${PreAggregateDefinitionsTableName}.pre_aggregate_definition->>'name' = ?`,
                [args.preAggregateDefinitionName],
            )
            .select<DbPreAggregateDefinitionWithExploreName[]>([
                `${PreAggregateDefinitionsTableName}.*`,
                this.database.raw(
                    `${CachedExploreTableName}.name as pre_agg_explore_name`,
                ),
            ])
            .first();

        if (!row) {
            return undefined;
        }

        return {
            ...toPreAggregateDefinition(row),
            preAggExploreName: row.pre_agg_explore_name,
        };
    }

    async getProjectSchedulerDetailsForPreAggregates(): Promise<
        PreAggregateSchedulerDetails[]
    > {
        type PreAggregateSchedulerDetailRow = {
            project_uuid: string;
            organization_uuid: string;
            created_by_user_uuid: string | null;
            scheduler_timezone: string;
            pre_aggregate_definition_uuid: string;
            pre_agg_explore_name: string;
            refresh_cron: string;
        };

        const rows = await this.database(PreAggregateDefinitionsTableName)
            .innerJoin(
                'projects',
                'projects.project_uuid',
                `${PreAggregateDefinitionsTableName}.project_uuid`,
            )
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .innerJoin(
                CachedExploreTableName,
                `${CachedExploreTableName}.cached_explore_uuid`,
                `${PreAggregateDefinitionsTableName}.pre_agg_cached_explore_uuid`,
            )
            .whereNotNull(`${PreAggregateDefinitionsTableName}.refresh_cron`)
            .select<PreAggregateSchedulerDetailRow[]>([
                `${PreAggregateDefinitionsTableName}.project_uuid`,
                'organizations.organization_uuid',
                'projects.created_by_user_uuid',
                'projects.scheduler_timezone',
                `${PreAggregateDefinitionsTableName}.pre_aggregate_definition_uuid`,
                this.database.raw(
                    `${CachedExploreTableName}.name as pre_agg_explore_name`,
                ),
                `${PreAggregateDefinitionsTableName}.refresh_cron`,
            ]);

        return rows.map((row) => ({
            projectUuid: row.project_uuid,
            organizationUuid: row.organization_uuid,
            createdByUserUuid: row.created_by_user_uuid,
            schedulerTimezone: row.scheduler_timezone,
            preAggregateDefinitionUuid: row.pre_aggregate_definition_uuid,
            preAggExploreName: row.pre_agg_explore_name,
            refreshCron: row.refresh_cron,
        }));
    }

    async insertInProgress(args: {
        projectUuid: string;
        preAggregateDefinitionUuid: string;
        trigger: PreAggregateMaterializationTrigger;
        definitionFingerprint: string | null;
    }): Promise<PreAggregateMaterialization> {
        const [row] = await this.database(PreAggregateMaterializationsTableName)
            .insert({
                project_uuid: args.projectUuid,
                pre_aggregate_definition_uuid: args.preAggregateDefinitionUuid,
                status: 'in_progress',
                trigger: args.trigger,
                materialized_fingerprint: args.definitionFingerprint,
                query_uuid: null,
                materialization_uri: null,
                materialized_at: null,
                row_count: null,
                columns: null,
                total_bytes: null,
                error_message: null,
            })
            .returning('*');

        return toPreAggregateMaterialization(row);
    }

    async attachQueryUuid(args: {
        materializationUuid: string;
        queryUuid: string;
    }): Promise<void> {
        await this.database(PreAggregateMaterializationsTableName)
            .update({
                query_uuid: args.queryUuid,
                updated_at: new Date(),
            })
            .where(
                'pre_aggregate_materialization_uuid',
                args.materializationUuid,
            );
    }

    async markFailed(args: {
        materializationUuid: string;
        errorMessage: string;
    }): Promise<void> {
        await this.database(PreAggregateMaterializationsTableName)
            .update({
                status: 'failed',
                error_message: args.errorMessage,
                updated_at: new Date(),
            })
            .where(
                'pre_aggregate_materialization_uuid',
                args.materializationUuid,
            );
    }

    async promoteToActive(args: {
        materializationUuid: string;
        queryUuid: string;
        materializationUri: string;
        materializedAt: Date;
        rowCount: number | null;
        columns: ResultColumns | null;
        totalBytes: number | null;
    }): Promise<{ status: 'active' | 'superseded' }> {
        try {
            return await this.database.transaction(async (trx) => {
                const row = await trx(PreAggregateMaterializationsTableName)
                    .where(
                        'pre_aggregate_materialization_uuid',
                        args.materializationUuid,
                    )
                    .forUpdate()
                    .first<DbPreAggregateMaterialization>();

                if (!row) {
                    throw new NotFoundError(
                        `Materialization ${args.materializationUuid} not found`,
                    );
                }

                const definition = await trx(PreAggregateDefinitionsTableName)
                    .where(
                        'pre_aggregate_definition_uuid',
                        row.pre_aggregate_definition_uuid,
                    )
                    .first<
                        Pick<DbPreAggregateDefinition, 'definition_fingerprint'>
                    >('definition_fingerprint');
                // The definition moved while this run was building: the file
                // describes the old shape, so it never becomes active.
                const isStale =
                    row.materialized_fingerprint !== null &&
                    definition !== undefined &&
                    definition.definition_fingerprint !== null &&
                    row.materialized_fingerprint !==
                        definition.definition_fingerprint;

                const currentActive = await trx(
                    PreAggregateMaterializationsTableName,
                )
                    .where(
                        'pre_aggregate_definition_uuid',
                        row.pre_aggregate_definition_uuid,
                    )
                    .andWhere('status', 'active')
                    .forUpdate()
                    .first<DbPreAggregateMaterialization>();

                const shouldPromote =
                    !isStale &&
                    (!currentActive ||
                        !currentActive.materialized_at ||
                        currentActive.materialized_at <= args.materializedAt);

                const commonUpdate = {
                    query_uuid: args.queryUuid,
                    materialization_uri: args.materializationUri,
                    materialized_at: args.materializedAt,
                    row_count: args.rowCount,
                    columns: args.columns,
                    total_bytes: args.totalBytes,
                    error_message: null,
                    updated_at: new Date(),
                };

                if (shouldPromote) {
                    await trx(PreAggregateMaterializationsTableName)
                        .update({
                            status: 'superseded',
                            updated_at: new Date(),
                        })
                        .where(
                            'pre_aggregate_definition_uuid',
                            row.pre_aggregate_definition_uuid,
                        )
                        .andWhere('status', 'active')
                        .andWhereNot(
                            'pre_aggregate_materialization_uuid',
                            args.materializationUuid,
                        );

                    await trx(PreAggregateMaterializationsTableName)
                        .update({
                            ...commonUpdate,
                            status: 'active',
                        })
                        .where(
                            'pre_aggregate_materialization_uuid',
                            args.materializationUuid,
                        );

                    return { status: 'active' } as const;
                }

                await trx(PreAggregateMaterializationsTableName)
                    .update({
                        ...commonUpdate,
                        status: 'superseded',
                    })
                    .where(
                        'pre_aggregate_materialization_uuid',
                        args.materializationUuid,
                    );

                return { status: 'superseded' } as const;
            });
        } catch (error) {
            const isUniqueConstraintViolation =
                (error as { code?: string } | undefined)?.code === '23505';

            if (!isUniqueConstraintViolation) {
                throw error;
            }

            await this.database(PreAggregateMaterializationsTableName)
                .update({
                    query_uuid: args.queryUuid,
                    materialization_uri: args.materializationUri,
                    materialized_at: args.materializedAt,
                    row_count: args.rowCount,
                    columns: args.columns,
                    status: 'superseded',
                    error_message: null,
                    updated_at: new Date(),
                })
                .where(
                    'pre_aggregate_materialization_uuid',
                    args.materializationUuid,
                );

            return { status: 'superseded' };
        }
    }

    async getActiveMaterialization(
        projectUuid: string,
        preAggExploreName: string,
    ): Promise<ActiveMaterializationDetails | undefined> {
        const row = await this.database(PreAggregateMaterializationsTableName)
            .innerJoin(
                PreAggregateDefinitionsTableName,
                `${PreAggregateMaterializationsTableName}.pre_aggregate_definition_uuid`,
                `${PreAggregateDefinitionsTableName}.pre_aggregate_definition_uuid`,
            )
            .innerJoin(
                CachedExploreTableName,
                `${PreAggregateDefinitionsTableName}.pre_agg_cached_explore_uuid`,
                `${CachedExploreTableName}.cached_explore_uuid`,
            )
            .where(
                `${PreAggregateMaterializationsTableName}.project_uuid`,
                projectUuid,
            )
            .andWhere(`${CachedExploreTableName}.name`, preAggExploreName)
            .andWhere(
                `${PreAggregateMaterializationsTableName}.status`,
                'active',
            )
            .whereNotNull(`${PreAggregateMaterializationsTableName}.query_uuid`)
            // Never serve a file built for an older definition shape
            .whereRaw(`(?? IS NULL OR ?? IS NULL OR ?? = ??)`, [
                `${PreAggregateMaterializationsTableName}.materialized_fingerprint`,
                `${PreAggregateDefinitionsTableName}.definition_fingerprint`,
                `${PreAggregateMaterializationsTableName}.materialized_fingerprint`,
                `${PreAggregateDefinitionsTableName}.definition_fingerprint`,
            ])
            .select<
                Pick<
                    DbPreAggregateMaterialization,
                    | 'pre_aggregate_materialization_uuid'
                    | 'query_uuid'
                    | 'materialization_uri'
                    | 'columns'
                    | 'materialized_at'
                    | 'total_bytes'
                >[]
            >([
                `${PreAggregateMaterializationsTableName}.pre_aggregate_materialization_uuid`,
                `${PreAggregateMaterializationsTableName}.query_uuid`,
                `${PreAggregateMaterializationsTableName}.materialization_uri`,
                `${PreAggregateMaterializationsTableName}.columns`,
                `${PreAggregateMaterializationsTableName}.materialized_at`,
                `${PreAggregateMaterializationsTableName}.total_bytes`,
            ])
            .orderBy(
                `${PreAggregateMaterializationsTableName}.materialized_at`,
                'desc',
            )
            .first();

        if (
            !row ||
            !row.query_uuid ||
            !row.materialization_uri ||
            !row.materialized_at
        ) {
            return undefined;
        }

        return {
            materializationUuid: row.pre_aggregate_materialization_uuid,
            queryUuid: row.query_uuid,
            materializationUri: row.materialization_uri,
            format: row.materialization_uri.endsWith('.parquet')
                ? 'parquet'
                : 'jsonl',
            columns: row.columns,
            materializedAt: row.materialized_at,
            totalBytes: row.total_bytes,
        };
    }

    /**
     * Every materialization file the project owns, active or superseded. A
     * serve session's storage credentials are scoped to exactly these URIs.
     */
    async findMaterializationUrisForProject(
        projectUuid: string,
    ): Promise<string[]> {
        const rows = await this.database(PreAggregateMaterializationsTableName)
            .where('project_uuid', projectUuid)
            .whereNotNull('materialization_uri')
            .select<
                Pick<DbPreAggregateMaterialization, 'materialization_uri'>[]
            >('materialization_uri');

        // Sorted so callers can compare two reads of the same set
        return [
            ...new Set(
                rows.flatMap((row) =>
                    row.materialization_uri ? [row.materialization_uri] : [],
                ),
            ),
        ].sort();
    }

    async getDefinitionsWithLatestMaterialization(
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<ApiPreAggregateMaterializationsResults>> {
        type DbDefinitionWithLatestMaterialization = Pick<
            DbPreAggregateDefinition,
            | 'pre_aggregate_definition_uuid'
            | 'pre_aggregate_definition'
            | 'materialization_metric_query'
            | 'refresh_cron'
            | 'materialize_on_change'
            | 'materialization_query_error'
        > & {
            source_explore_name: string;
            pre_agg_explore_name: string;
            // Latest materialization fields (nullable from LEFT JOIN)
            mat_uuid: string | null;
            mat_status: PreAggregateMaterializationStatus | null;
            mat_materialized_at: Date | null;
            mat_row_count: number | null;
            mat_columns: ResultColumns | null;
            mat_error_message: string | null;
            mat_total_bytes: number | null;
            mat_trigger: PreAggregateMaterializationTrigger | null;
            mat_created_at: Date | null;
        };

        const query = this.database
            .with('latest_mat', (qb) => {
                void qb
                    .select(
                        `${PreAggregateMaterializationsTableName}.*`,
                        this.database.raw(
                            `ROW_NUMBER() OVER (PARTITION BY pre_aggregate_definition_uuid ORDER BY created_at DESC) as rn`,
                        ),
                    )
                    .from(PreAggregateMaterializationsTableName);
            })
            .from(PreAggregateDefinitionsTableName)
            .leftJoin('latest_mat', function joinLatestMat() {
                this.on(
                    'latest_mat.pre_aggregate_definition_uuid',
                    `${PreAggregateDefinitionsTableName}.pre_aggregate_definition_uuid`,
                ).andOnVal('latest_mat.rn', 1);
            })
            .innerJoin(
                `${CachedExploreTableName} as source_ce`,
                `source_ce.cached_explore_uuid`,
                `${PreAggregateDefinitionsTableName}.source_cached_explore_uuid`,
            )
            .innerJoin(
                `${CachedExploreTableName} as preagg_ce`,
                `preagg_ce.cached_explore_uuid`,
                `${PreAggregateDefinitionsTableName}.pre_agg_cached_explore_uuid`,
            )
            .where(
                `${PreAggregateDefinitionsTableName}.project_uuid`,
                projectUuid,
            )
            .select<DbDefinitionWithLatestMaterialization[]>([
                `${PreAggregateDefinitionsTableName}.pre_aggregate_definition_uuid`,
                `${PreAggregateDefinitionsTableName}.pre_aggregate_definition`,
                `${PreAggregateDefinitionsTableName}.materialization_metric_query`,
                `source_ce.name as source_explore_name`,
                `preagg_ce.name as pre_agg_explore_name`,
                `${PreAggregateDefinitionsTableName}.refresh_cron`,
                `${PreAggregateDefinitionsTableName}.materialize_on_change`,
                `${PreAggregateDefinitionsTableName}.materialization_query_error`,
                `latest_mat.pre_aggregate_materialization_uuid as mat_uuid`,
                `latest_mat.status as mat_status`,
                `latest_mat.materialized_at as mat_materialized_at`,
                `latest_mat.row_count as mat_row_count`,
                `latest_mat.columns as mat_columns`,
                `latest_mat.error_message as mat_error_message`,
                `latest_mat.total_bytes as mat_total_bytes`,
                `latest_mat.trigger as mat_trigger`,
                `latest_mat.created_at as mat_created_at`,
            ])
            .orderBy(`${PreAggregateDefinitionsTableName}.created_at`, 'desc');

        const result = await KnexPaginate.paginate(query, paginateArgs);

        const materializations: PreAggregateMaterializationSummary[] =
            result.data.map((row) => {
                const materialization = row.mat_uuid
                    ? {
                          materializationUuid: row.mat_uuid,
                          status: row.mat_status!,
                          materializedAt: row.mat_materialized_at,
                          durationMs:
                              row.mat_materialized_at && row.mat_created_at
                                  ? new Date(
                                        row.mat_materialized_at,
                                    ).getTime() -
                                    new Date(row.mat_created_at).getTime()
                                  : null,
                          rowCount: row.mat_row_count,
                          columns: row.mat_columns,
                          totalBytes: row.mat_total_bytes,
                          errorMessage: row.mat_error_message,
                          trigger: row.mat_trigger!,
                      }
                    : null;

                return {
                    preAggregateDefinitionUuid:
                        row.pre_aggregate_definition_uuid,
                    preAggregateName: row.pre_aggregate_definition.name,
                    externalTable: row.pre_aggregate_definition.table ?? null,
                    preAggExploreName: row.pre_agg_explore_name,
                    sourceExploreName: row.source_explore_name,
                    materializationRole:
                        row.pre_aggregate_definition.materializationRole ??
                        null,
                    dimensions: row.pre_aggregate_definition.dimensions ?? [],
                    metrics: row.pre_aggregate_definition.metrics ?? [],
                    filters: row.pre_aggregate_definition.filters ?? [],
                    timeDimension:
                        row.pre_aggregate_definition.timeDimension ?? null,
                    granularity:
                        row.pre_aggregate_definition.granularity ?? null,
                    refreshCron: row.refresh_cron,
                    materializeOnChange: row.materialize_on_change,
                    definitionError: row.materialization_query_error,
                    resolvedMaxRows:
                        row.materialization_metric_query?.resolvedMaxRows ??
                        null,
                    warnings: computePreAggregateWarnings(materialization, {
                        materializationMaxRows:
                            row.materialization_metric_query?.resolvedMaxRows ??
                            null,
                    }),
                    materialization,
                };
            });

        return {
            data: { materializations },
            pagination: result.pagination,
        };
    }
}
