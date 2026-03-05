import {
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
import {
    PreAggregateDefinitionsTableName,
    PreAggregateMaterializationsTableName,
    type DbPreAggregateDefinition,
    type DbPreAggregateDefinitionIn,
    type DbPreAggregateMaterialization,
} from '../database/entities/preAggregates';
import { CachedExploreTableName } from '../database/entities/projects';
import KnexPaginate from '../database/pagination';

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

    async upsertPreAggregateDefinitions(
        definitions: DbPreAggregateDefinitionIn[],
    ): Promise<void> {
        if (definitions.length === 0) {
            return;
        }

        await this.database(PreAggregateDefinitionsTableName)
            .insert(definitions)
            .onConflict('pre_agg_cached_explore_uuid')
            .merge({
                source_cached_explore_uuid: this.database.raw(
                    'excluded.source_cached_explore_uuid',
                ),
                pre_aggregate_definition: this.database.raw(
                    'excluded.pre_aggregate_definition',
                ),
                materialization_metric_query: this.database.raw(
                    'excluded.materialization_metric_query',
                ),
                materialization_query_error: this.database.raw(
                    'excluded.materialization_query_error',
                ),
                refresh_cron: this.database.raw('excluded.refresh_cron'),
                updated_at: this.database.fn.now(),
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
    }): Promise<PreAggregateMaterialization> {
        const [row] = await this.database(PreAggregateMaterializationsTableName)
            .insert({
                project_uuid: args.projectUuid,
                pre_aggregate_definition_uuid: args.preAggregateDefinitionUuid,
                status: 'in_progress',
                trigger: args.trigger,
                query_uuid: null,
                materialization_uri: null,
                materialized_at: null,
                row_count: null,
                columns: null,
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
                    !currentActive ||
                    !currentActive.materialized_at ||
                    currentActive.materialized_at <= args.materializedAt;

                const commonUpdate = {
                    query_uuid: args.queryUuid,
                    materialization_uri: args.materializationUri,
                    materialized_at: args.materializedAt,
                    row_count: args.rowCount,
                    columns: args.columns,
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
            .select<
                Pick<
                    DbPreAggregateMaterialization,
                    | 'pre_aggregate_materialization_uuid'
                    | 'query_uuid'
                    | 'materialization_uri'
                    | 'columns'
                    | 'materialized_at'
                >[]
            >([
                `${PreAggregateMaterializationsTableName}.pre_aggregate_materialization_uuid`,
                `${PreAggregateMaterializationsTableName}.query_uuid`,
                `${PreAggregateMaterializationsTableName}.materialization_uri`,
                `${PreAggregateMaterializationsTableName}.columns`,
                `${PreAggregateMaterializationsTableName}.materialized_at`,
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
            format: 'jsonl',
            columns: row.columns,
            materializedAt: row.materialized_at,
        };
    }

    async getDefinitionsWithLatestMaterialization(
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<ApiPreAggregateMaterializationsResults>> {
        type DbDefinitionWithLatestMaterialization = Pick<
            DbPreAggregateDefinition,
            | 'pre_aggregate_definition_uuid'
            | 'pre_aggregate_definition'
            | 'refresh_cron'
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
            mat_trigger: PreAggregateMaterializationTrigger | null;
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
                `source_ce.name as source_explore_name`,
                `preagg_ce.name as pre_agg_explore_name`,
                `${PreAggregateDefinitionsTableName}.refresh_cron`,
                `${PreAggregateDefinitionsTableName}.materialization_query_error`,
                `latest_mat.pre_aggregate_materialization_uuid as mat_uuid`,
                `latest_mat.status as mat_status`,
                `latest_mat.materialized_at as mat_materialized_at`,
                `latest_mat.row_count as mat_row_count`,
                `latest_mat.columns as mat_columns`,
                `latest_mat.error_message as mat_error_message`,
                `latest_mat.trigger as mat_trigger`,
            ])
            .orderBy(`${PreAggregateDefinitionsTableName}.created_at`, 'desc');

        const result = await KnexPaginate.paginate(query, paginateArgs);

        const materializations: PreAggregateMaterializationSummary[] =
            result.data.map((row) => ({
                preAggregateDefinitionUuid: row.pre_aggregate_definition_uuid,
                preAggregateName: row.pre_aggregate_definition.name,
                preAggExploreName: row.pre_agg_explore_name,
                sourceExploreName: row.source_explore_name,
                dimensions: row.pre_aggregate_definition.dimensions ?? [],
                metrics: row.pre_aggregate_definition.metrics ?? [],
                timeDimension:
                    row.pre_aggregate_definition.timeDimension ?? null,
                granularity: row.pre_aggregate_definition.granularity ?? null,
                refreshCron: row.refresh_cron,
                definitionError: row.materialization_query_error,
                materialization: row.mat_uuid
                    ? {
                          materializationUuid: row.mat_uuid,
                          status: row.mat_status!,
                          materializedAt: row.mat_materialized_at,
                          rowCount: row.mat_row_count,
                          columns: row.mat_columns,
                          errorMessage: row.mat_error_message,
                          trigger: row.mat_trigger!,
                      }
                    : null,
            }));

        return {
            data: { materializations },
            pagination: result.pagination,
        };
    }
}
