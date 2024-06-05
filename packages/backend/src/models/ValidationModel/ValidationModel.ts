import {
    ChartKind,
    CreateValidation,
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    NotFoundError,
    ValidationErrorChartResponse,
    ValidationErrorDashboardResponse,
    ValidationErrorTableResponse,
    ValidationResponse,
    ValidationResponseBase,
    ValidationSourceType,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DashboardsTableName,
    DashboardTable,
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';
import {
    SavedChartsTableName,
    SavedChartTable,
} from '../../database/entities/savedCharts';
import { DbSpace, SpaceTableName } from '../../database/entities/spaces';
import { UserTable, UserTableName } from '../../database/entities/users';
import {
    DbValidationTable,
    ValidationTableName,
} from '../../database/entities/validation';

type ValidationModelArguments = {
    database: Knex;
};

export class ValidationModel {
    private database: Knex;

    constructor(args: ValidationModelArguments) {
        this.database = args.database;
    }

    async create(
        validations: CreateValidation[],
        jobId?: string,
    ): Promise<void> {
        if (validations.length > 0) {
            await this.database(ValidationTableName).insert(
                validations.map((validation) => ({
                    project_uuid: validation.projectUuid,
                    error: validation.error,
                    job_id: jobId ?? null,
                    error_type: validation.errorType,
                    source: validation.source ?? null,
                    ...(isTableValidationError(validation) && {
                        model_name: validation.modelName,
                    }),
                    ...(isChartValidationError(validation) && {
                        saved_chart_uuid: validation.chartUuid,
                        field_name: validation.fieldName,
                        chart_name: validation.chartName ?? null,
                    }),
                    ...(isDashboardValidationError(validation) && {
                        dashboard_uuid: validation.dashboardUuid,
                        field_name: validation.fieldName ?? null,
                        chart_name: validation.chartName ?? null,
                        model_name: validation.name,
                    }),
                })),
            );
        }
    }

    async delete(projectUuid: string): Promise<void> {
        await this.database(ValidationTableName)
            .where({ project_uuid: projectUuid })
            .delete();
    }

    async getByValidationId(
        validationId: number,
    ): Promise<Pick<ValidationResponseBase, 'validationId' | 'projectUuid'>> {
        const [validation] = await this.database(ValidationTableName).where(
            'validation_id',
            validationId,
        );

        if (!validation) {
            throw new NotFoundError(
                `Validation with id ${validationId} not found`,
            );
        }

        return {
            validationId: validation.validation_id,
            projectUuid: validation.project_uuid,
        };
    }

    async deleteValidation(validationId: number): Promise<void> {
        await this.database(ValidationTableName)
            .where('validation_id', validationId)
            .delete();
    }

    async get(
        projectUuid: string,
        jobId?: string,
    ): Promise<ValidationResponse[]> {
        const chartValidationErrorsRows = await this.database(
            ValidationTableName,
        )
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
                UserTableName,
                `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where('project_uuid', projectUuid)
            .andWhere((queryBuilder) => {
                if (jobId) {
                    void queryBuilder.where('job_id', jobId);
                } else {
                    void queryBuilder.whereNull('job_id');
                }
            })
            .andWhere(
                `${ValidationTableName}.source`,
                ValidationSourceType.Chart,
            )
            .select<
                (DbValidationTable &
                    Pick<
                        SavedChartTable['base'],
                        | 'name'
                        | 'views_count'
                        | 'last_version_updated_at'
                        | 'last_version_chart_kind'
                    > &
                    Pick<UserTable['base'], 'first_name' | 'last_name'> &
                    Pick<DbSpace, 'space_uuid'> & {
                        last_updated_at: Date;
                    })[]
            >([
                `${ValidationTableName}.*`,
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.last_version_updated_at`,
                `${SavedChartsTableName}.last_version_chart_kind`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${SpaceTableName}.space_uuid`,
                `${SavedChartsTableName}.views_count`,
            ])
            .orderBy([
                {
                    column: `${SavedChartsTableName}.name`,
                    order: 'asc',
                },
                {
                    column: `${SavedChartsTableName}.saved_query_id`,
                    order: 'desc',
                },
                {
                    column: `${ValidationTableName}.error`,
                    order: 'asc',
                },
            ])
            .distinctOn([
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.saved_query_id`,
                `${ValidationTableName}.error`,
            ]);

        const chartValidationErrors: ValidationErrorChartResponse[] =
            chartValidationErrorsRows.map((validationError) => ({
                createdAt: validationError.created_at,
                chartUuid: validationError.saved_chart_uuid!,
                chartViews: validationError.views_count,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name:
                    validationError.name ||
                    validationError.chart_name ||
                    'Chart does not exist',
                lastUpdatedBy: validationError.first_name
                    ? `${validationError.first_name} ${validationError.last_name}`
                    : undefined,
                lastUpdatedAt: validationError.last_version_updated_at,
                validationId: validationError.validation_id,
                spaceUuid: validationError.space_uuid,
                chartKind:
                    validationError.last_version_chart_kind ||
                    ChartKind.VERTICAL_BAR,
                errorType: validationError.error_type,
                fieldName: validationError.field_name ?? undefined,
                source: ValidationSourceType.Chart,
            }));

        const dashboardValidationErrorsRows: (DbValidationTable &
            Pick<DashboardTable['base'], 'name' | 'views_count'> &
            Pick<UserTable['base'], 'first_name' | 'last_name'> &
            Pick<DbSpace, 'space_uuid'> & {
                last_updated_at: Date;
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
            .andWhere((queryBuilder) => {
                if (jobId) {
                    void queryBuilder.where('job_id', jobId);
                } else {
                    void queryBuilder.whereNull('job_id');
                }
            })
            .andWhere(
                `${ValidationTableName}.source`,
                ValidationSourceType.Dashboard,
            )
            .select([
                `${ValidationTableName}.*`,
                `${DashboardsTableName}.name`,
                `${DashboardVersionsTableName}.created_at as last_updated_at`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${SpaceTableName}.space_uuid`,
                `${DashboardsTableName}.views_count`,
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

        const dashboardValidationErrors: ValidationErrorDashboardResponse[] =
            dashboardValidationErrorsRows.map((validationError) => ({
                createdAt: validationError.created_at,
                dashboardUuid: validationError.dashboard_uuid!,
                dashboardViews: validationError.views_count,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name:
                    validationError.name ||
                    validationError.model_name ||
                    'Dashboard does not exist',
                lastUpdatedBy: validationError.first_name
                    ? `${validationError.first_name} ${validationError.last_name}`
                    : undefined,
                lastUpdatedAt: validationError.last_updated_at,
                validationId: validationError.validation_id,
                spaceUuid: validationError.space_uuid,
                errorType: validationError.error_type,
                fieldName: validationError.field_name ?? undefined,
                chartName: validationError.chart_name ?? undefined,
                source: ValidationSourceType.Dashboard,
            }));

        const tableValidationErrorsRows: DbValidationTable[] =
            await this.database(ValidationTableName)
                .select(`${ValidationTableName}.*`)
                .where('project_uuid', projectUuid)
                .andWhere((queryBuilder) => {
                    if (jobId) {
                        void queryBuilder.where('job_id', jobId);
                    } else {
                        void queryBuilder.whereNull('job_id');
                    }
                })
                .andWhere(
                    `${ValidationTableName}.source`,
                    ValidationSourceType.Table,
                )
                .distinctOn(`${ValidationTableName}.error`);

        const tableValidationErrors: ValidationErrorTableResponse[] =
            tableValidationErrorsRows.map((validationError) => ({
                createdAt: validationError.created_at,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name: validationError.model_name ?? undefined,
                validationId: validationError.validation_id,
                errorType: validationError.error_type,
                source: ValidationSourceType.Table,
            }));

        return [
            ...tableValidationErrors,
            ...chartValidationErrors,
            ...dashboardValidationErrors,
        ];
    }
}
