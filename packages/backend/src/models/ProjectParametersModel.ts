import {
    KnexPaginateArgs,
    LightdashProjectConfig,
    NotFoundError,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ProjectParametersTableName,
    type DbProjectParameter,
} from '../database/entities/projectParameters';
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

    async findPaginated(
        projectUuid: string,
        options?: {
            search?: string;
            sortBy?: 'name' | 'created_at';
            sortOrder?: 'asc' | 'desc';
        },
        paginateArgs?: KnexPaginateArgs,
    ) {
        let query = this.database(ProjectParametersTableName).where(
            'project_uuid',
            projectUuid,
        );

        // Add search functionality
        if (options?.search) {
            const trimmedSearch = options.search.trim();
            if (trimmedSearch.length > 0) {
                const searchTerm = `%${trimmedSearch}%`;
                query = query.where((builder) => {
                    void builder
                        .whereILike('name', searchTerm)
                        .orWhereRaw("config->>'label' ILIKE ?", [searchTerm])
                        .orWhereRaw("config->>'description' ILIKE ?", [
                            searchTerm,
                        ]);
                });
            }
        }

        // Add sorting
        const sortBy = options?.sortBy || 'created_at';
        const sortOrder = options?.sortOrder || 'desc';
        query = query.orderBy(sortBy, sortOrder);

        // If no sorting by name is specified, add name as secondary sort for consistency
        if (sortBy !== 'name') {
            query = query.orderBy('name', 'asc');
        }

        return KnexPaginate.paginate(
            query.select<DbProjectParameter[]>(),
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
