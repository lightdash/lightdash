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
        const validationErrors = await this.database(ValidationTableName)
            .select('*')
            .where('project_uuid', projectUuid);

        return validationErrors.map((validationError) => {
            const validation = {
                createdAt: validationError.created_at,
                projectUuid: validationError.project_uuid,
                summary: validationError.summary,
                error: validationError.error,
                ...(validationError.dashboard_uuid && {
                    chartUuid: validationError.dashboard_uuid,
                }),
                ...(validationError.saved_chart_uuid && {
                    chartUuid: validationError.saved_chart_uuid,
                }),
            };

            return {
                ...validation,
                // TODO: fix below
                name: 'unknown',
                // TODO: fix below
                lastUpdatedBy: 'last_updated_by',
            };
        });
    }
}
