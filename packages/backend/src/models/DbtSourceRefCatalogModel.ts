import { type Knex } from 'knex';
import { DbtSourceRefCatalogsTableName } from '../database/entities/dbtSourceRefCatalogs';

export class DbtSourceRefCatalogModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async getProjectNames(projectUuid: string) {
        return this.database(DbtSourceRefCatalogsTableName)
            .select('dbt_source_uuid', 'project_name')
            .where('project_uuid', projectUuid);
    }
}
