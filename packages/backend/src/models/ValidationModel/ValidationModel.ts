import { ValidationResponse } from '@lightdash/common';
import { Knex } from 'knex';
import {
    ValidationInsert,
    ValidationTableName,
} from '../../database/entities/validation';

type ValidationModelDependencies = {
    database: Knex;
};

export class ValidationModel {
    private database: Knex;

    constructor(deps: ValidationModelDependencies) {
        this.database = deps.database;
    }

    async create(validations: ValidationInsert[]): Promise<void> {
        await this.database.transaction(async (trx) => {
            const insertPromises = validations.map((validation) =>
                trx(ValidationTableName).insert({
                    saved_chart_uuid: validation.savedChartUuid,
                    dashboard_uuid: validation.dashboardUuid,
                    project_uuid: validation.projectUuid,
                    error: validation.error,
                }),
            );

            await Promise.all(insertPromises);
        });
    }

    async delete(projectUuid: string): Promise<void> {
        await this.database(ValidationTableName)
            .where({ project_uuid: projectUuid })
            .delete();
    }

    async get(projectUuid: string): Promise<ValidationResponse[]> {
        const chartsAndErrorsRows: (DbValidationTable & {
            name: string;
            first_name: string;
            last_name: string;
        })[] = await this.database(ValidationTableName)
            .select('validations.*')
            .leftJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${ValidationTableName}.saved_chart_uuid`,
            )
            .innerJoin(
                'saved_queries_versions',
                `${SavedChartsTableName}.saved_query_id`,
                'saved_queries_versions.saved_query_id',
            )
            .leftJoin(
                UserTableName,
                'saved_queries_versions.updated_by_user_uuid',
                `${UserTableName}.user_uuid`,
            )
            .where('project_uuid', projectUuid)
            .select([
                'validations.*',
                'saved_queries.name',
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
            ]);

        const chartValidationErrors = Promise.all(
            chartsAndErrorsRows.map(async (validationError) => ({
                createdAt: validationError.created_at,
                projectUuid: validationError.project_uuid,
                summary: validationError.summary,
                error: validationError.error,
                name: validationError.name,
                lastUpdatedBy: `${validationError.first_name} ${validationError.last_name}`,
            })),
        );

        // TODO: add dashboard validation errors

        return chartValidationErrors;
    }
}
