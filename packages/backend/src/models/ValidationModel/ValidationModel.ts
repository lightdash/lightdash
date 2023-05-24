import { CreateValidation, ValidationResponse } from '@lightdash/common';
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
import { DbSpace, SpaceTableName } from '../../database/entities/spaces';
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

    async create(validations: CreateValidation[]): Promise<void> {
        await this.database.transaction(async (trx) => {
            const insertPromises = validations.map((validation) =>
                trx(ValidationTableName).insert({
                    saved_chart_uuid: validation.chartUuid,
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
            Pick<DbSpace, 'space_uuid'> & {
                last_updated_at: Pick<
                    SavedChartVersionsTable['base'],
                    'created_at'
                >;
            })[] = await this.database(ValidationTableName)
            .leftJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${ValidationTableName}.saved_chart_uuid`,
            )
            .leftJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${SavedChartsTableName}.space_id`,
            )
            .leftJoin(
                `${SavedChartVersionsTableName}`,
                `${SavedChartVersionsTableName}.saved_query_id`,
                `${SavedChartsTableName}.saved_query_id`,
            )
            .leftJoin(
                UserTableName,
                `${SavedChartVersionsTableName}.updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where('project_uuid', projectUuid)
            .andWhereNot(`${ValidationTableName}.saved_chart_uuid`, null)
            .select([
                `${ValidationTableName}.*`,
                `${SavedChartsTableName}.name`,
                `${SavedChartVersionsTableName}.created_at as last_updated_at`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${SpaceTableName}.space_uuid`,
            ])
            .orderBy([
                {
                    column: `${SavedChartsTableName}.name`,
                    order: 'asc',
                },
                {
                    column: `${SavedChartVersionsTableName}.saved_query_id`,
                    order: 'desc',
                },
                {
                    column: `${ValidationTableName}.error`,
                    order: 'asc',
                },
            ])
            .distinctOn([
                `${SavedChartsTableName}.name`,
                `${SavedChartVersionsTableName}.saved_query_id`,
                `${ValidationTableName}.error`,
            ]);

        const chartValidationErrors = chartValidationErrorsRows.map(
            (validationError) => ({
                createdAt: validationError.created_at,
                chartUuid: validationError.saved_chart_uuid ?? undefined,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name: validationError.name,
                lastUpdatedBy: validationError.first_name
                    ? `${validationError.first_name} ${validationError.last_name}`
                    : undefined,
                lastUpdatedAt: validationError.last_updated_at,
                validationId: validationError.validation_id,
                spaceUuid: validationError.space_uuid,
            }),
        );

        const dashboardValidationErrorsRows: (DbValidationTable &
            Pick<DashboardTable['base'], 'name'> &
            Pick<UserTable['base'], 'first_name' | 'last_name'> &
            Pick<DbSpace, 'space_uuid'> & {
                last_updated_at: Pick<
                    DashboardVersionTable['base'],
                    'created_at'
                >;
            })[] = await this.database(ValidationTableName)
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${ValidationTableName}.dashboard_uuid`,
            )
            .leftJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
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
            .andWhereNot(`${ValidationTableName}.dashboard_uuid`, null)
            .select([
                `${ValidationTableName}.*`,
                `${DashboardsTableName}.name`,
                `${DashboardVersionsTableName}.created_at as last_updated_at`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${SpaceTableName}.space_uuid`,
            ])
            .orderBy([
                {
                    column: `${DashboardsTableName}.name`,
                    order: 'asc',
                },
                {
                    column: `${DashboardVersionsTableName}.dashboard_id`,
                    order: 'desc',
                },
                {
                    column: `${ValidationTableName}.error`,
                    order: 'asc',
                },
            ])
            .distinctOn([
                `${DashboardsTableName}.name`,
                `${DashboardVersionsTableName}.dashboard_id`,
                `${ValidationTableName}.error`,
            ]);

        const dashboardValidationErrors = dashboardValidationErrorsRows.map(
            (validationError) => ({
                createdAt: validationError.created_at,
                dashboardUuid: validationError.dashboard_uuid ?? undefined,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name: validationError.name,
                lastUpdatedBy: validationError.first_name
                    ? `${validationError.first_name} ${validationError.last_name}`
                    : undefined,
                lastUpdatedAt: validationError.last_updated_at,
                validationId: validationError.validation_id,
                spaceUuid: validationError.space_uuid,
            }),
        );

        const tableValidationErrorsRows: DbValidationTable[] =
            await this.database(ValidationTableName)
                .select(`${ValidationTableName}.*`)
                .where('project_uuid', projectUuid)
                .whereNull('saved_chart_uuid')
                .whereNull('dashboard_uuid')
                .distinctOn(`${ValidationTableName}.error`);

        const tableValidationErrors = tableValidationErrorsRows.map(
            (validationError) => ({
                createdAt: validationError.created_at,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name: 'Table',
                validationId: validationError.validation_id,
            }),
        );

        return [
            ...tableValidationErrors,
            ...chartValidationErrors,
            ...dashboardValidationErrors,
        ];
    }
}
