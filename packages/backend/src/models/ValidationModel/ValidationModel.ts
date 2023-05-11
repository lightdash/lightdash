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

        // TODO: should this be done in Service?
        return Promise.all(
            validationErrors.map(async (validationError) => {
                const validation: Partial<ValidationResponse> = {
                    createdAt: validationError.created_at,
                    projectUuid: validationError.project_uuid,
                    summary: validationError.summary,
                    error: validationError.error,
                    ...(validationError.dashboard_uuid && {
                        dashboardUuid: validationError.dashboard_uuid,
                    }),
                };

                if (validationError.saved_chart_uuid) {
                    const chart = await savedChartModel.get(
                        validationError.saved_chart_uuid,
                    );
                    validation.name = chart.name;
                    validation.lastUpdatedBy = `${chart.updatedByUser?.firstName} ${chart.updatedByUser?.lastName}`;
                    validation.chartUuid = validationError.saved_chart_uuid;
                } else {
                    validation.name = 'Private content';
                    // TODO: check this
                    validation.lastUpdatedBy = '';
                }

                // updated by in dashboard?
                // lastUpdatedBy might not exist - when it hasnt been used in a chart yet

                // TODO: remove typecast
                return validation as ValidationResponse;
            }),
        );
    }
}
