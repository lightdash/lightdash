import { NotFoundError } from '@lightdash/common';
import { Knex } from 'knex';
import {
    ProjectParametersTableName,
    type CreateDbProjectParameter,
    type DbProjectParameter,
    type UpdateDbProjectParameter,
} from '../database/entities/projectParameters';

export class ProjectParametersModel {
    private database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async find(projectUuid: string, names: string[]) {
        const query = this.database(ProjectParametersTableName);

        if (projectUuid) {
            void query.where('project_uuid', projectUuid);
        }

        if (names.length > 0) {
            void query.whereIn('name', names);
        }

        return query.select('*');
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

    async create(
        data: CreateDbProjectParameter | CreateDbProjectParameter[],
    ): Promise<DbProjectParameter[]> {
        const parametersToInsert = Array.isArray(data) ? data : [data];

        const insertedParameters = await this.database(
            ProjectParametersTableName,
        )
            .insert(
                parametersToInsert.map((param) => ({
                    project_uuid: param.project_uuid,
                    name: param.name,
                    config: param.config,
                })),
            )
            .returning('*');

        return insertedParameters;
    }

    async update(
        projectUuid: string,
        name: string,
        data: UpdateDbProjectParameter,
    ): Promise<DbProjectParameter> {
        const [parameter] = await this.database(ProjectParametersTableName)
            .update({
                config: data.config,
            })
            .where('project_uuid', projectUuid)
            .where('name', name)
            .returning('*');

        if (!parameter) {
            throw new NotFoundError(
                `Parameter with project_uuid ${projectUuid} and name ${name} not found`,
            );
        }

        return parameter;
    }

    async delete(projectUuid: string, name: string): Promise<void> {
        const deletedRows = await this.database(ProjectParametersTableName)
            .where('project_uuid', projectUuid)
            .where('name', name)
            .del();

        if (deletedRows === 0) {
            throw new NotFoundError(
                `Parameter with project_uuid ${projectUuid} and name ${name} not found`,
            );
        }
    }

    async deleteByProject(projectUuid: string): Promise<void> {
        await this.database(ProjectParametersTableName)
            .where('project_uuid', projectUuid)
            .del();
    }
}
