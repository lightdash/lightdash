import { ValidationResponse } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DashboardsTableName,
    DashboardTable,
    DashboardVersionsTableName,
    DashboardVersionTable,
} from '../../database/entities/dashboards';
import {
    SavedChartsTableName,
    SavedChartTable,
    SavedChartVersionsTable,
    SavedChartVersionsTableName,
} from '../../database/entities/savedCharts';
import { UserTable, UserTableName } from '../../database/entities/users';
import {
    DbValidationTable,
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
        const chartValidationErrorsRows: (DbValidationTable &
            Pick<SavedChartTable['base'], 'name'> &
            Pick<UserTable['base'], 'first_name' | 'last_name'> &
            Pick<SavedChartVersionsTable['base'], 'created_at'>)[] =
            await this.database(ValidationTableName)
                .select(`${ValidationTableName}.*`)
                .leftJoin(
                    SavedChartsTableName,
                    `${SavedChartsTableName}.saved_query_uuid`,
                    `${ValidationTableName}.saved_chart_uuid`,
                )
                .innerJoin(
                    `${SavedChartVersionsTableName}`,
                    `${SavedChartsTableName}.saved_query_id`,
                    `${SavedChartVersionsTableName}.saved_query_id`,
                )
                .leftJoin(
                    UserTableName,
                    `${SavedChartVersionsTableName}.updated_by_user_uuid`,
                    `${UserTableName}.user_uuid`,
                )
                .where('project_uuid', projectUuid)
                .select([
                    `${ValidationTableName}.*`,
                    `${SavedChartsTableName}.name`,
                    `${SavedChartVersionsTableName}.created_at as last_updated_at`,
                    `${UserTableName}.first_name`,
                    `${UserTableName}.last_name`,
                ]);

        const chartValidationErrors = await Promise.all(
            chartValidationErrorsRows.map(async (validationError) => ({
                createdAt: validationError.created_at,
                chartUuid: validationError.saved_chart_uuid ?? undefined,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name: validationError.name,
                lastUpdatedBy: `${validationError.first_name} ${validationError.last_name}`,
                lastUpdatedAt: validationError.created_at,
            })),
        );

        const dashboardValidationErrorsRows: (DbValidationTable &
            Pick<DashboardTable['base'], 'name'> &
            Pick<UserTable['base'], 'first_name' | 'last_name'> &
            Pick<DashboardVersionTable['base'], 'created_at'>)[] =
            await this.database(ValidationTableName)
                .select(`${ValidationTableName}.*`)
                .leftJoin(
                    DashboardsTableName,
                    `${DashboardsTableName}.dashboard_uuid`,
                    `${ValidationTableName}.dashboard_uuid`,
                )
                .innerJoin(
                    `${DashboardVersionsTableName}`,
                    `${DashboardsTableName}.dashboard_id`,
                    `${DashboardVersionsTableName}.dashboard_id`,
                )
                .leftJoin(
                    UserTableName,
                    `${UserTableName}.user_uuid`,
                    `${DashboardVersionsTableName}.updated_by_user_uuid`,
                )
                .where('project_uuid', projectUuid)
                .select([
                    `${ValidationTableName}.*`,
                    `${DashboardsTableName}.name`,
                    `${DashboardVersionsTableName}.created_at`,
                    `${UserTableName}.first_name`,
                    `${UserTableName}.last_name`,
                ]);

        const dashboardValidationErrors = await Promise.all(
            dashboardValidationErrorsRows.map(async (validationError) => ({
                createdAt: validationError.created_at,
                dashboardUuid: validationError.dashboard_uuid ?? undefined,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name: validationError.name,
                lastUpdatedBy: `${validationError.first_name} ${validationError.last_name}`,
                lastUpdatedAt: validationError.created_at,
            })),
        );

        const tableValidationErrorsRows: DbValidationTable[] =
            await this.database(ValidationTableName)
                .select(`${ValidationTableName}.*`)
                .where('project_uuid', projectUuid)
                .whereNull('saved_chart_uuid')
                .whereNull('dashboard_uuid');

        const tableValidationErrors = await Promise.all(
            tableValidationErrorsRows.map(async (validationError) => ({
                createdAt: validationError.created_at,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name: 'Table',
            })),
        );

        return [
            ...chartValidationErrors,
            ...dashboardValidationErrors,
            ...tableValidationErrors,
        ];
    }
}
