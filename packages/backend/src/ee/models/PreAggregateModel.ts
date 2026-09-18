import {
    assertUnreachable,
    computePreAggregateWarnings,
    getPreAggregateExploreName,
    isExploreError,
    NotFoundError,
    ParameterError,
    ProjectType,
    type ActiveMaterializationDetails,
    type ApiPreAggregateMaterializationsResults,
    type Explore,
    type ExploreError,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type MaterializationMetricQueryPayload,
    type PhysicalOutputContract,
    type PreAggregateDefinition,
    type PreAggregateDefinitionWithExploreName,
    type PreAggregateMaterialization,
    type PreAggregateMaterializationProvenance,
    type PreAggregateMaterializationStatus,
    type PreAggregateMaterializationSummary,
    type PreAggregateMaterializationTrigger,
    type PreAggregateSchedulerDetails,
    type ResultColumns,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import isEqual from 'lodash/isEqual';
import { CachedExploreTableName } from '../../database/entities/projects';
import KnexPaginate from '../../database/pagination';
import {
    PreAggregateDefinitionsTableName,
    PreAggregateMaterializationsTableName,
    PreAggregateReuseStateTableName,
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
    sourceExploreName: row.source_explore_name,
    preAggregateName: row.pre_aggregate_name,
    publicationVersion: row.publication_version,
    compatibilityHash: row.compatibility_hash,
    scheduleRevision: row.schedule_revision,
    schedulerTimezone: row.scheduler_timezone,
    physicalOutputContract: row.physical_output_contract,
    preparationStatus: row.preparation_status,
    automaticEligible: row.automatic_eligible,
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
    scheduleRevision: row.schedule_revision,
    projectUuid: row.project_uuid,
    preAggregateDefinitionUuid: row.pre_aggregate_definition_uuid,
    publicationVersion: row.publication_version,
    compatibilityHash: row.compatibility_hash,
    evaluatedAt: row.evaluated_at,
    physicalOutputContract: row.physical_output_contract,
    pinnedContextHash: row.pinned_context_hash,
    executionScopeKeyId: row.execution_scope_key_id,
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

export type PublishPreAggregateDefinition = Omit<
    DbPreAggregateDefinitionIn,
    | 'source_cached_explore_uuid'
    | 'pre_agg_cached_explore_uuid'
    | 'schedule_revision'
    | 'scheduler_timezone'
> & {
    source_explore_name: string;
    pre_aggregate_name: string;
    publication_version: string;
    compatibility_hash: string | null;
    physical_output_contract: PhysicalOutputContract | null;
    preparation_status: DbPreAggregateDefinition['preparation_status'];
    automatic_eligible: boolean;
};

export type PreAggregatePublicationScope =
    | { type: 'full' }
    | { type: 'partial'; sourceExploreNames: string[] };

export type PreAggregateServingSnapshot = {
    definition: PreAggregateDefinition;
    activeMaterialization: ActiveMaterializationDetails | undefined;
    sourceExplore: Explore;
    preAggExplore: Explore;
};

// A generation identifies one publication; only verified semantic equality can
// carry a build across publications. Unknown provenance stays generation-local.
const isCompatible = (
    definition: DbPreAggregateDefinition,
    materialization: DbPreAggregateMaterialization,
): boolean =>
    definition.preparation_status !== 'invalid' &&
    definition.materialization_query_error === null &&
    definition.materialization_metric_query !== null &&
    definition.source_cached_explore_uuid !== null &&
    definition.pre_agg_cached_explore_uuid !== null &&
    definition.pre_aggregate_definition.table === undefined &&
    definition.publication_version !== null &&
    materialization.publication_version !== null &&
    isEqual(
        definition.physical_output_contract,
        materialization.physical_output_contract,
    ) &&
    (definition.preparation_status === 'ready' &&
    definition.compatibility_hash !== null &&
    definition.physical_output_contract !== null
        ? definition.compatibility_hash === materialization.compatibility_hash
        : definition.publication_version ===
              materialization.publication_version &&
          definition.compatibility_hash === materialization.compatibility_hash);

const toActiveMaterialization = (
    row: DbPreAggregateMaterialization | undefined,
): ActiveMaterializationDetails | undefined => {
    if (!row || !row.materialization_uri || !row.materialized_at)
        return undefined;
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
        publicationVersion: row.publication_version,
        compatibilityHash: row.compatibility_hash,
        evaluatedAt: row.evaluated_at,
        physicalOutputContract: row.physical_output_contract,
        pinnedContextHash: row.pinned_context_hash,
        executionScopeKeyId: row.execution_scope_key_id,
    };
};

export class ObsoletePreAggregateScheduleError extends ParameterError {
    constructor() {
        super('Pre-aggregate schedule changed before the build started');
    }
}

export class PreAggregateModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async getReuseState(
        database: Knex | Knex.Transaction = this.database,
    ): Promise<{ phase: 'compatibility' | 'active'; reuseEnabled: boolean }> {
        const row = await database(PreAggregateReuseStateTableName)
            .where('state_key', 'singleton')
            .first();
        if (!row)
            throw new NotFoundError(
                'Pre-aggregate reuse rollout state not found',
            );
        return { phase: row.phase, reuseEnabled: row.reuse_enabled };
    }

    async isLegacyDefinitionAutomaticallyEligible(
        definition: PreAggregateDefinition,
        database: Knex | Knex.Transaction = this.database,
    ): Promise<boolean> {
        // Old writers leave logical names unset and the additive eligibility
        // column at its default. Infer only those rows during compatibility.
        if (
            (definition.sourceExploreName !== null &&
                definition.preAggregateName !== null) ||
            definition.preAggregateDefinition.table !== undefined ||
            definition.preparationStatus === 'invalid' ||
            definition.materializationQueryError !== null ||
            definition.materializationMetricQuery === null ||
            definition.sourceCachedExploreUuid === null ||
            definition.preAggCachedExploreUuid === null
        )
            return false;
        const project = await database('projects')
            .where('project_uuid', definition.projectUuid)
            .select('project_type')
            .first();
        return (
            project !== undefined &&
            project.project_type !== ProjectType.PREVIEW
        );
    }

    async publishDefinitions(
        args: {
            projectUuid: string;
            definitions: PublishPreAggregateDefinition[];
            scope: PreAggregatePublicationScope;
            invalidSourceErrors: Record<string, string>;
            schedulerTimezone: string;
        },
        trx: Knex.Transaction,
    ): Promise<{
        definitions: PreAggregateDefinition[];
        scheduleChanges: string[];
    }> {
        const { phase } = await this.getReuseState(trx);
        // The cache writer holds the project lock before this callback. Lock the
        // registry in deterministic order, also shared by build promotion.
        let existingQuery = trx(PreAggregateDefinitionsTableName)
            .where('project_uuid', args.projectUuid)
            .orderBy('pre_aggregate_definition_uuid')
            .forUpdate();
        switch (args.scope.type) {
            case 'full':
                break;
            case 'partial':
                existingQuery = existingQuery.where((builder) =>
                    builder
                        .whereIn(
                            'source_explore_name',
                            args.scope.type === 'partial'
                                ? args.scope.sourceExploreNames
                                : [],
                        )
                        .orWhereNull('source_explore_name'),
                );
                break;
            default:
                assertUnreachable(
                    args.scope,
                    'Unknown pre-aggregate publication scope',
                );
        }
        const fetchedExisting = await existingQuery;
        const caches = await trx(CachedExploreTableName)
            .where('project_uuid', args.projectUuid)
            .select('cached_explore_uuid', 'name');
        const cacheByName = new Map(
            caches.map((cache) => [cache.name, cache.cached_explore_uuid]),
        );
        const cacheNameByUuid = new Map(
            caches.map((cache) => [cache.cached_explore_uuid, cache.name]),
        );
        const scopedNames =
            args.scope.type === 'partial'
                ? new Set(args.scope.sourceExploreNames)
                : null;
        const existing = fetchedExisting.filter(
            (row) =>
                !scopedNames ||
                scopedNames.has(
                    row.source_explore_name ??
                        (row.source_cached_explore_uuid
                            ? (cacheNameByUuid.get(
                                  row.source_cached_explore_uuid,
                              ) ?? '')
                            : ''),
                ),
        );
        const published: PreAggregateDefinition[] = [];
        const scheduleChanges = new Set<string>();
        const retained = new Set<string>();
        const attachableDefinitions = args.definitions.filter(
            (definition) =>
                phase === 'active' ||
                (cacheByName.has(definition.source_explore_name) &&
                    cacheByName.has(
                        getPreAggregateExploreName(
                            definition.source_explore_name,
                            definition.pre_aggregate_name,
                        ),
                    )),
        );
        for (const definition of attachableDefinitions) {
            if (definition.project_uuid !== args.projectUuid)
                throw new ParameterError(
                    'Pre-aggregate publication project mismatch',
                );
            const sourceUuid =
                cacheByName.get(definition.source_explore_name) ?? null;
            const generatedUuid =
                cacheByName.get(
                    getPreAggregateExploreName(
                        definition.source_explore_name,
                        definition.pre_aggregate_name,
                    ),
                ) ?? null;
            const previous = existing.find(
                (row) =>
                    (row.source_explore_name ===
                        definition.source_explore_name &&
                        row.pre_aggregate_name ===
                            definition.pre_aggregate_name) ||
                    (generatedUuid !== null &&
                        row.pre_agg_cached_explore_uuid === generatedUuid),
            );
            // Compatibility keeps the old NOT NULL / CASCADE schema until every
            // writer supports detached rows. Invalid diagnostics become durable
            // with activation; source warnings continue to report them meanwhile.
            const values = {
                ...definition,
                source_cached_explore_uuid: sourceUuid,
                pre_agg_cached_explore_uuid: generatedUuid,
                scheduler_timezone: args.schedulerTimezone,
                schedule_revision:
                    previous &&
                    previous.refresh_cron === definition.refresh_cron &&
                    previous.scheduler_timezone === args.schedulerTimezone &&
                    previous.automatic_eligible ===
                        definition.automatic_eligible &&
                    (previous.preparation_status === 'invalid') ===
                        (definition.preparation_status === 'invalid')
                        ? (previous.schedule_revision ?? randomUUID())
                        : randomUUID(),
                updated_at: new Date(),
            };
            // Avoid competing old-cache and new-logical ON CONFLICT targets in
            // mixed-version compatibility mode: adopt the row before updating.
            const writeQuery = previous
                ? trx(PreAggregateDefinitionsTableName)
                      .where(
                          'pre_aggregate_definition_uuid',
                          previous.pre_aggregate_definition_uuid,
                      )
                      .update(values)
                : trx(PreAggregateDefinitionsTableName).insert(values);
            // Definition locks are acquired in the enclosing transaction.
            // eslint-disable-next-line no-await-in-loop
            const [row] = await writeQuery.returning('*');
            if (
                !previous ||
                previous.schedule_revision !== row.schedule_revision ||
                previous.automatic_eligible !== row.automatic_eligible ||
                (previous.preparation_status === 'invalid') !==
                    (row.preparation_status === 'invalid')
            )
                scheduleChanges.add(row.pre_aggregate_definition_uuid);
            retained.add(row.pre_aggregate_definition_uuid);
            published.push(toPreAggregateDefinition(row));
        }
        for (const previous of existing.filter(
            (row) => !retained.has(row.pre_aggregate_definition_uuid),
        )) {
            scheduleChanges.add(previous.pre_aggregate_definition_uuid);
            const sourceError =
                previous.source_explore_name === null
                    ? undefined
                    : args.invalidSourceErrors[previous.source_explore_name];
            if (sourceError && phase === 'active') {
                // eslint-disable-next-line no-await-in-loop
                const [row] = await trx(PreAggregateDefinitionsTableName)
                    .where(
                        'pre_aggregate_definition_uuid',
                        previous.pre_aggregate_definition_uuid,
                    )
                    .update({
                        source_cached_explore_uuid:
                            previous.source_explore_name === null
                                ? null
                                : (cacheByName.get(
                                      previous.source_explore_name,
                                  ) ?? null),
                        pre_agg_cached_explore_uuid: null,
                        publication_version: randomUUID(),
                        compatibility_hash: null,
                        physical_output_contract: null,
                        materialization_metric_query: null,
                        materialization_query_error: sourceError,
                        preparation_status: 'invalid',
                        automatic_eligible: false,
                        schedule_revision: randomUUID(),
                        updated_at: new Date(),
                    })
                    .returning('*');
                published.push(toPreAggregateDefinition(row));
            } else {
                // Removed definitions retire their history; renames are new keys.
                // eslint-disable-next-line no-await-in-loop
                await trx(PreAggregateDefinitionsTableName)
                    .where(
                        'pre_aggregate_definition_uuid',
                        previous.pre_aggregate_definition_uuid,
                    )
                    .delete();
            }
        }
        return {
            definitions: published,
            scheduleChanges: [...scheduleChanges],
        };
    }

    async refreshDesiredPreparation(args: {
        projectUuid: string;
        preAggregateDefinitionUuid: string;
        expectedPublicationVersion: string;
        compatibilityHash: string | null;
        physicalOutputContract: PhysicalOutputContract | null;
        preparationStatus: DbPreAggregateDefinition['preparation_status'];
        automaticEligible: boolean;
        materializationQueryError: string | null;
        materializationMetricQuery: MaterializationMetricQueryPayload | null;
    }): Promise<PreAggregateDefinition | undefined> {
        return this.database.transaction(async (trx) => {
            const current = await trx(PreAggregateDefinitionsTableName)
                .where({
                    project_uuid: args.projectUuid,
                    pre_aggregate_definition_uuid:
                        args.preAggregateDefinitionUuid,
                    publication_version: args.expectedPublicationVersion,
                })
                .forUpdate()
                .first();
            if (!current) return undefined;
            if (
                current.compatibility_hash === args.compatibilityHash &&
                isEqual(
                    current.physical_output_contract,
                    args.physicalOutputContract,
                ) &&
                current.preparation_status === args.preparationStatus &&
                current.automatic_eligible === args.automaticEligible &&
                current.materialization_query_error ===
                    args.materializationQueryError &&
                isEqual(
                    current.materialization_metric_query,
                    args.materializationMetricQuery,
                )
            )
                return toPreAggregateDefinition(current);
            const [row] = await trx(PreAggregateDefinitionsTableName)
                .where(
                    'pre_aggregate_definition_uuid',
                    current.pre_aggregate_definition_uuid,
                )
                .update({
                    publication_version: randomUUID(),
                    compatibility_hash: args.compatibilityHash,
                    physical_output_contract: args.physicalOutputContract,
                    preparation_status: args.preparationStatus,
                    automatic_eligible: args.automaticEligible,
                    materialization_query_error: args.materializationQueryError,
                    materialization_metric_query:
                        args.materializationMetricQuery,
                    schedule_revision:
                        current.automatic_eligible !== args.automaticEligible ||
                        (current.preparation_status === 'invalid') !==
                            (args.preparationStatus === 'invalid')
                            ? randomUUID()
                            : current.schedule_revision,
                    updated_at: new Date(),
                })
                .returning('*');
            return toPreAggregateDefinition(row);
        });
    }

    async updateScheduleTimezone(
        projectUuid: string,
        schedulerTimezone: string,
        trx?: Knex.Transaction,
    ): Promise<string[]> {
        const database = trx ?? this.database;
        const rows = await database(PreAggregateDefinitionsTableName)
            .where('project_uuid', projectUuid)
            .whereRaw('scheduler_timezone IS DISTINCT FROM ?', [
                schedulerTimezone,
            ])
            .update({
                scheduler_timezone: schedulerTimezone,
                schedule_revision: this.database.raw('uuid_generate_v4()'),
                updated_at: new Date(),
            })
            .returning('pre_aggregate_definition_uuid');
        return rows.map((row) => row.pre_aggregate_definition_uuid);
    }

    async invalidateProjectPreparations(
        projectUuid: string,
        trx?: Knex.Transaction,
    ): Promise<void> {
        const database = trx ?? this.database;
        await database(PreAggregateDefinitionsTableName)
            .where('project_uuid', projectUuid)
            .update({
                publication_version: this.database.raw('uuid_generate_v4()'),
                compatibility_hash: null,
                preparation_status: 'unverified',
                updated_at: new Date(),
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
            schedule_revision: string | null;
        };

        const { phase } = await this.getReuseState();
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
            .modify((builder) => {
                if (phase === 'active')
                    void builder.where(
                        `${PreAggregateDefinitionsTableName}.automatic_eligible`,
                        true,
                    );
            })
            .whereNot(
                `${PreAggregateDefinitionsTableName}.preparation_status`,
                'invalid',
            )
            .whereNull(
                `${PreAggregateDefinitionsTableName}.materialization_query_error`,
            )
            .whereNotNull(
                `${PreAggregateDefinitionsTableName}.materialization_metric_query`,
            )
            .whereRaw(
                `${PreAggregateDefinitionsTableName}.pre_aggregate_definition->>'table' IS NULL`,
            )
            .whereNot('projects.project_type', ProjectType.PREVIEW)
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
                `${PreAggregateDefinitionsTableName}.schedule_revision`,
            ]);

        return rows.map((row) => ({
            projectUuid: row.project_uuid,
            organizationUuid: row.organization_uuid,
            createdByUserUuid: row.created_by_user_uuid,
            schedulerTimezone: row.scheduler_timezone,
            preAggregateDefinitionUuid: row.pre_aggregate_definition_uuid,
            preAggExploreName: row.pre_agg_explore_name,
            refreshCron: row.refresh_cron,
            scheduleRevision: row.schedule_revision,
        }));
    }

    async insertInProgress(args: {
        projectUuid: string;
        preAggregateDefinitionUuid: string;
        trigger: PreAggregateMaterializationTrigger;
        expectedScheduleRevision?: string;
        provenance?: PreAggregateMaterializationProvenance & {
            publicationVersion: string;
            evaluatedAt: Date;
        };
    }): Promise<PreAggregateMaterialization> {
        return this.database.transaction(async (trx) => {
            const definition = await trx(PreAggregateDefinitionsTableName)
                .where({
                    project_uuid: args.projectUuid,
                    pre_aggregate_definition_uuid:
                        args.preAggregateDefinitionUuid,
                })
                .forUpdate()
                .first();
            if (!definition)
                throw new NotFoundError('Pre-aggregate definition not found');
            const { phase } = await this.getReuseState(trx);
            const automaticEligible =
                definition.automatic_eligible ||
                (phase === 'compatibility' &&
                    (await this.isLegacyDefinitionAutomaticallyEligible(
                        toPreAggregateDefinition(definition),
                        trx,
                    )));
            if (
                args.trigger === 'cron' &&
                ((args.expectedScheduleRevision
                    ? definition.schedule_revision !==
                      args.expectedScheduleRevision
                    : phase === 'active') ||
                    !automaticEligible ||
                    !definition.refresh_cron)
            )
                throw new ObsoletePreAggregateScheduleError();
            if (phase === 'active' && !args.provenance)
                throw new ParameterError(
                    'Materialization provenance is required after reuse activation',
                );
            if (
                args.provenance &&
                (definition.publication_version !==
                    args.provenance.publicationVersion ||
                    definition.compatibility_hash !==
                        args.provenance.compatibilityHash ||
                    !isEqual(
                        definition.physical_output_contract,
                        args.provenance.physicalOutputContract,
                    ) ||
                    definition.preparation_status === 'invalid' ||
                    definition.materialization_query_error !== null ||
                    definition.materialization_metric_query === null ||
                    definition.pre_aggregate_definition.table !== undefined ||
                    !definition.source_cached_explore_uuid ||
                    !definition.pre_agg_cached_explore_uuid)
            )
                throw new ParameterError(
                    'Pre-aggregate publication changed before the build started',
                );
            const [row] = await trx(PreAggregateMaterializationsTableName)
                .insert({
                    project_uuid: args.projectUuid,
                    pre_aggregate_definition_uuid:
                        args.preAggregateDefinitionUuid,
                    status: 'in_progress',
                    trigger: args.trigger,
                    schedule_revision:
                        args.trigger === 'cron'
                            ? (args.expectedScheduleRevision ?? null)
                            : null,
                    query_uuid: null,
                    materialization_uri: null,
                    materialized_at: null,
                    row_count: null,
                    columns: null,
                    total_bytes: null,
                    error_message: null,
                    publication_version:
                        args.provenance?.publicationVersion ?? null,
                    compatibility_hash:
                        args.provenance?.compatibilityHash ?? null,
                    physical_output_contract:
                        args.provenance?.physicalOutputContract ?? null,
                    pinned_context_hash:
                        args.provenance?.pinnedContextHash ?? null,
                    execution_scope_key_id:
                        args.provenance?.executionScopeKeyId ?? null,
                    evaluated_at: args.provenance?.evaluatedAt ?? null,
                })
                .returning('*');
            return toPreAggregateMaterialization(row);
        });
    }

    async getMaterializationByQueryUuid(
        queryUuid: string,
    ): Promise<PreAggregateMaterialization | undefined> {
        const row = await this.database(PreAggregateMaterializationsTableName)
            .where('query_uuid', queryUuid)
            .first();
        return row ? toPreAggregateMaterialization(row) : undefined;
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
            )
            .andWhere('status', 'in_progress');
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
        return this.database.transaction(async (trx) => {
            const candidate = await trx(PreAggregateMaterializationsTableName)
                .where(
                    'pre_aggregate_materialization_uuid',
                    args.materializationUuid,
                )
                .first();
            if (!candidate)
                throw new NotFoundError(
                    `Materialization ${args.materializationUuid} not found`,
                );
            // Every new writer locks the definition first. Scheduler timeouts do
            // not cancel warehouse work, so queue serialization is insufficient.
            const definition = await trx(PreAggregateDefinitionsTableName)
                .where(
                    'pre_aggregate_definition_uuid',
                    candidate.pre_aggregate_definition_uuid,
                )
                .forUpdate()
                .first();
            const row = await trx(PreAggregateMaterializationsTableName)
                .where(
                    'pre_aggregate_materialization_uuid',
                    args.materializationUuid,
                )
                .forUpdate()
                .first();
            if (!row || !definition)
                throw new NotFoundError(
                    'Pre-aggregate was removed before the build completed',
                );
            const { phase } = await this.getReuseState(trx);
            const currentActive = await trx(
                PreAggregateMaterializationsTableName,
            )
                .where(
                    'pre_aggregate_definition_uuid',
                    row.pre_aggregate_definition_uuid,
                )
                .andWhere('status', 'active')
                .forUpdate()
                .first();
            if (row.status === 'active') return { status: 'active' };
            const hasCompatiblePublication =
                phase === 'compatibility' ||
                (row.evaluated_at !== null && isCompatible(definition, row));
            const candidateTime = row.evaluated_at ?? args.materializedAt;
            const currentTime =
                currentActive?.evaluated_at ?? currentActive?.materialized_at;
            const isNewer =
                !currentActive ||
                !currentTime ||
                candidateTime.getTime() > currentTime.getTime() ||
                (candidateTime.getTime() === currentTime.getTime() &&
                    (row.created_at.getTime() >
                        currentActive.created_at.getTime() ||
                        (row.created_at.getTime() ===
                            currentActive.created_at.getTime() &&
                            row.pre_aggregate_materialization_uuid >
                                currentActive.pre_aggregate_materialization_uuid)));
            const shouldPromote =
                row.status === 'in_progress' &&
                hasCompatiblePublication &&
                isNewer;
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
                    .where(
                        'pre_aggregate_definition_uuid',
                        row.pre_aggregate_definition_uuid,
                    )
                    .andWhere('status', 'active')
                    .update({ status: 'superseded', updated_at: new Date() });
            }
            const status = shouldPromote ? 'active' : 'superseded';
            await trx(PreAggregateMaterializationsTableName)
                .where(
                    'pre_aggregate_materialization_uuid',
                    args.materializationUuid,
                )
                .update({ ...commonUpdate, status });
            return { status };
        });
    }

    async getServingSnapshot(
        projectUuid: string,
        preAggExploreName: string,
    ): Promise<PreAggregateServingSnapshot | undefined> {
        return this.database.transaction(
            async (trx) => {
                const definition = await trx(PreAggregateDefinitionsTableName)
                    .innerJoin(
                        `${CachedExploreTableName} as generated`,
                        `${PreAggregateDefinitionsTableName}.pre_agg_cached_explore_uuid`,
                        'generated.cached_explore_uuid',
                    )
                    .where(
                        `${PreAggregateDefinitionsTableName}.project_uuid`,
                        projectUuid,
                    )
                    .andWhere('generated.name', preAggExploreName)
                    .select(`${PreAggregateDefinitionsTableName}.*`)
                    .first();
                if (
                    !definition ||
                    !definition.source_cached_explore_uuid ||
                    !definition.pre_agg_cached_explore_uuid
                )
                    return undefined;
                const explores = await trx(CachedExploreTableName)
                    .whereIn('cached_explore_uuid', [
                        definition.source_cached_explore_uuid,
                        definition.pre_agg_cached_explore_uuid,
                    ])
                    .select<
                        {
                            cached_explore_uuid: string;
                            explore: Explore | ExploreError;
                        }[]
                    >('cached_explore_uuid', 'explore');
                const source = explores.find(
                    (explore) =>
                        explore.cached_explore_uuid ===
                        definition.source_cached_explore_uuid,
                )?.explore;
                const generated = explores.find(
                    (explore) =>
                        explore.cached_explore_uuid ===
                        definition.pre_agg_cached_explore_uuid,
                )?.explore;
                if (
                    !source ||
                    !generated ||
                    isExploreError(source) ||
                    isExploreError(generated)
                )
                    return undefined;
                const active = await trx(PreAggregateMaterializationsTableName)
                    .where(
                        'pre_aggregate_definition_uuid',
                        definition.pre_aggregate_definition_uuid,
                    )
                    .andWhere('status', 'active')
                    .first();
                const { phase } = await this.getReuseState(trx);
                const eligible =
                    active &&
                    (phase === 'compatibility' ||
                        (active.evaluated_at !== null &&
                            isCompatible(definition, active)));
                return {
                    definition: toPreAggregateDefinition(definition),
                    activeMaterialization: eligible
                        ? toActiveMaterialization(active)
                        : undefined,
                    sourceExplore: source,
                    preAggExplore: generated,
                };
            },
            { isolationLevel: 'repeatable read', readOnly: true },
        );
    }

    async getActiveMaterialization(
        projectUuid: string,
        preAggExploreName: string,
    ): Promise<ActiveMaterializationDetails | undefined> {
        return (await this.getServingSnapshot(projectUuid, preAggExploreName))
            ?.activeMaterialization;
    }

    async getDefinitionsWithLatestMaterialization(
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<ApiPreAggregateMaterializationsResults>> {
        type DbDefinitionWithLatestMaterialization =
            DbPreAggregateDefinition & {
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
                active_materialization:
                    | (Omit<
                          DbPreAggregateMaterialization,
                          | 'created_at'
                          | 'updated_at'
                          | 'evaluated_at'
                          | 'materialized_at'
                      > & {
                          created_at: string;
                          updated_at: string;
                          evaluated_at: string | null;
                          materialized_at: string | null;
                      })
                    | null;
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
            .leftJoin(
                `${PreAggregateMaterializationsTableName} as active_mat`,
                function joinActiveMat() {
                    this.on(
                        'active_mat.pre_aggregate_definition_uuid',
                        `${PreAggregateDefinitionsTableName}.pre_aggregate_definition_uuid`,
                    ).andOnVal('active_mat.status', 'active');
                },
            )
            .leftJoin(
                `${CachedExploreTableName} as source_ce`,
                `source_ce.cached_explore_uuid`,
                `${PreAggregateDefinitionsTableName}.source_cached_explore_uuid`,
            )
            .leftJoin(
                `${CachedExploreTableName} as preagg_ce`,
                `preagg_ce.cached_explore_uuid`,
                `${PreAggregateDefinitionsTableName}.pre_agg_cached_explore_uuid`,
            )
            .where(
                `${PreAggregateDefinitionsTableName}.project_uuid`,
                projectUuid,
            )
            .select<DbDefinitionWithLatestMaterialization[]>([
                `${PreAggregateDefinitionsTableName}.*`,
                this.database.raw(
                    `COALESCE(${PreAggregateDefinitionsTableName}.source_explore_name, source_ce.name) as source_explore_name`,
                ),
                this.database.raw(
                    `COALESCE(preagg_ce.name, '__preagg__' || ${PreAggregateDefinitionsTableName}.source_explore_name || '__' || ${PreAggregateDefinitionsTableName}.pre_aggregate_name) as pre_agg_explore_name`,
                ),
                this.database.raw(
                    'row_to_json(active_mat) as active_materialization',
                ),
                `${PreAggregateDefinitionsTableName}.refresh_cron`,
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
        const { phase } = await this.getReuseState();

        const materializations: PreAggregateMaterializationSummary[] =
            result.data.map((row) => {
                const materialization =
                    row.mat_uuid && row.mat_status && row.mat_trigger
                        ? {
                              materializationUuid: row.mat_uuid,
                              status: row.mat_status,
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
                              trigger: row.mat_trigger,
                          }
                        : null;

                const activeRow = row.active_materialization;
                const active = activeRow
                    ? {
                          ...activeRow,
                          created_at: new Date(activeRow.created_at),
                          updated_at: new Date(activeRow.updated_at),
                          evaluated_at: activeRow.evaluated_at
                              ? new Date(activeRow.evaluated_at)
                              : null,
                          materialized_at: activeRow.materialized_at
                              ? new Date(activeRow.materialized_at)
                              : null,
                      }
                    : null;
                const activeMaterialization =
                    active &&
                    toActiveMaterialization(active) &&
                    (phase === 'compatibility' ||
                        (active.evaluated_at !== null &&
                            isCompatible(row, active)))
                        ? {
                              materializationUuid:
                                  active.pre_aggregate_materialization_uuid,
                              status: active.status,
                              materializedAt: active.materialized_at,
                              durationMs: active.materialized_at
                                  ? active.materialized_at.getTime() -
                                    active.created_at.getTime()
                                  : null,
                              rowCount: active.row_count,
                              columns: active.columns,
                              totalBytes: active.total_bytes,
                              errorMessage: active.error_message,
                              trigger: active.trigger,
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
                    definitionError: row.materialization_query_error,
                    resolvedMaxRows:
                        row.materialization_metric_query?.resolvedMaxRows ??
                        null,
                    warnings: computePreAggregateWarnings(
                        activeMaterialization ?? materialization,
                        {
                            materializationMaxRows:
                                row.materialization_metric_query
                                    ?.resolvedMaxRows ?? null,
                        },
                    ),
                    materialization,
                    activeMaterialization,
                    preparationStatus: row.preparation_status,
                };
            });

        return {
            data: { materializations },
            pagination: result.pagination,
        };
    }
}
