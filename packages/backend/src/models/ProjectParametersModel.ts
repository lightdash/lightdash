import {
    KnexPaginateArgs,
    KnexPaginatedData,
    LightdashProjectConfig,
    LightdashProjectParameter,
    NotFoundError,
    ProjectParameterSummary,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ProjectParametersTableName,
    type DbProjectParameter,
} from '../database/entities/projectParameters';
import { CachedExploreTableName } from '../database/entities/projects';
import KnexPaginate from '../database/pagination';

export class ProjectParametersModel {
    private database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async find(projectUuid: string, names?: string[]) {
        const query = this.database(ProjectParametersTableName).where(
            'project_uuid',
            projectUuid,
        );

        if (names) {
            void query.whereIn('name', names);
        }

        return query.select('*');
    }

    async findCombinedParametersPaginated(
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
        options?: {
            search?: string;
            sortBy?: 'name';
            sortOrder?: 'asc' | 'desc';
        },
    ): Promise<KnexPaginatedData<ProjectParameterSummary[]>> {
        let query = this.database
            .with('config_params', (qb) => {
                void qb
                    .select(
                        'name',
                        'config',
                        this.database.raw("'config' as source"),
                        this.database.raw('NULL as modelName'),
                    )
                    .from(ProjectParametersTableName)
                    .where('project_uuid', projectUuid);
            })
            .with('model_params', (qb) => {
                void qb
                    .select(
                        this.database.raw('param_data.key as name'),
                        this.database.raw('param_data.value as config'),
                        this.database.raw("'model' as source"),
                        this.database.raw('cached_explore.name as modelName'),
                    )
                    .from(`${CachedExploreTableName} as cached_explore`)
                    .crossJoin(
                        this.database.raw(
                            'jsonb_each(cached_explore.explore -> ?) as param_data(key, value)',
                            ['parameters'],
                        ),
                    )
                    .where('cached_explore.project_uuid', projectUuid)
                    .whereRaw('cached_explore.explore -> ? IS NOT NULL', [
                        'parameters',
                    ])
                    .whereRaw(
                        "jsonb_typeof(cached_explore.explore -> ?) = 'object'",
                        ['parameters'],
                    );
            })
            .with('combined_params', (qb) => {
                void qb
                    .select('*')
                    .from('config_params')
                    .unionAll(this.database.select('*').from('model_params'));
            })
            .select('*')
            .from('combined_params');

        // Apply search filter
        if (options?.search) {
            const searchTerm = options.search.trim();
            if (searchTerm.length > 0) {
                query = query.where((builder) => {
                    void builder
                        .whereILike('name', `%${searchTerm}%`)
                        .orWhereRaw("config->>'label' ILIKE ?", [
                            `%${searchTerm}%`,
                        ])
                        .orWhereRaw("config->>'description' ILIKE ?", [
                            `%${searchTerm}%`,
                        ])
                        .orWhereILike('modelName', `%${searchTerm}%`);
                });
            }
        }

        // Apply sorting
        const sortBy = options?.sortBy || 'name';
        const sortOrder = options?.sortOrder || 'asc';
        query = query.orderBy(sortBy, sortOrder);

        // Use KnexPaginate for pagination - query already returns the correct structure
        return KnexPaginate.paginate(
            query.select<ProjectParameterSummary[]>(),
            paginateArgs,
        );
    }

    async get(projectUuid: string, name: string): Promise<DbProjectParameter> {
        const [parameter] = await this.database(ProjectParametersTableName)
            .select('*')
            .where('project_uuid', projectUuid)
            .where('name', name);

        if (!parameter) {
            throw new NotFoundError(
                `Parameter with project_uuid ${projectUuid} and name ${name} not found`,
            );
        }

        return parameter;
    }

    async replace(
        projectUuid: string,
        parameters: Required<LightdashProjectConfig>['parameters'],
    ) {
        return this.database.transaction(async (trx) => {
            // remove all
            await trx(ProjectParametersTableName)
                .where('project_uuid', projectUuid)
                .del();

            const entries = parameters ? Object.entries(parameters) : [];
            if (entries.length === 0) {
                // Nothing to insert, just return
                return [];
            }
            // insert all
            return trx(ProjectParametersTableName)
                .insert(
                    entries.map(([key, param]) => ({
                        project_uuid: projectUuid,
                        name: key,
                        config: param,
                    })),
                )
                .returning('*');
        });
    }
}
