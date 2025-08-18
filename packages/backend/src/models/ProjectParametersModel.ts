import {
    KnexPaginateArgs,
    KnexPaginatedData,
    LightdashProjectConfig,
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
                    .select({
                        name: 'name',
                        config: 'config',
                        source: this.database.raw("'config'"),
                        modelName: this.database.raw('NULL'),
                    })
                    .from(ProjectParametersTableName)
                    .where('project_uuid', projectUuid);
            })
            .with('model_params', (qb) => {
                void qb
                    .select({
                        name: 'param_data.key',
                        config: 'param_data.value',
                        source: this.database.raw("'model'"),
                        modelName: `${CachedExploreTableName}.name`,
                    })
                    .from(CachedExploreTableName)
                    .crossJoin(
                        this.database.raw(
                            `jsonb_each(${CachedExploreTableName}.explore -> ?) as param_data(key, value)`,
                            ['parameters'],
                        ),
                    )
                    .where(
                        `${CachedExploreTableName}.project_uuid`,
                        projectUuid,
                    )
                    .whereRaw(
                        `${CachedExploreTableName}.explore -> ? IS NOT NULL`,
                        ['parameters'],
                    )
                    .whereRaw(
                        `jsonb_typeof(${CachedExploreTableName}.explore -> ?) = 'object'`,
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
