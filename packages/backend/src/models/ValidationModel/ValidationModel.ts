import {
    ChartKind,
    CreateValidation,
    DashboardFilterValidationErrorType,
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotFoundError,
    ValidationErrorChartResponse,
    ValidationErrorDashboardResponse,
    ValidationErrorTableResponse,
    ValidationErrorType,
    ValidationResponse,
    ValidationResponseBase,
    ValidationSourceType,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DatabaseError } from 'pg';
import {
    DashboardsTableName,
    DashboardTable,
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';
import { ProjectTableName } from '../../database/entities/projects';
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
import Logger from '../../logging/logger';

type NormalizedValidationRow = {
    validation_id: number;
    created_at: Date;
    project_uuid: string;
    error: string;
    error_type: ValidationErrorType;
    source: ValidationSourceType;
    field_name: string | null;
    chart_name: string | null;
    model_name: string | null;
    saved_chart_uuid: string | null;
    dashboard_uuid: string | null;
    resource_name: string | null;
    views_count: number | null;
    last_updated_at: Date | null;
    first_name: string | null;
    last_name: string | null;
    space_uuid: string | null;
    last_version_chart_kind: string | null;
};

type ValidationModelArguments = {
    database: Knex;
};

export class ValidationModel {
    private database: Knex;

    constructor(args: ValidationModelArguments) {
        this.database = args.database;
    }

    async create({
        projectUuid,
        validations,
        jobId,
    }: {
        projectUuid: string;
        validations: CreateValidation[];
        jobId?: string;
    }): Promise<void> {
        await this.database.transaction(async (trx) => {
            // Lock the project to avoid concurrent validation updates
            await trx(ProjectTableName)
                .where('project_uuid', projectUuid)
                .forUpdate();

            if (validations.length > 0) {
                await ValidationModel.create(trx, validations, jobId);
            }
        });
    }

    static async create(
        transaction: Knex.Transaction,
        validations: CreateValidation[],
        jobId?: string,
    ): Promise<void> {
        if (validations.length > 0) {
            try {
                await transaction.batchInsert(
                    ValidationTableName,
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
            } catch (error: unknown) {
                const FOREIGN_KEY_VIOLATION_ERROR_CODE = '23503';
                const handledConstraints = [
                    'validations_project_uuid_foreign',
                    'validations_saved_chart_uuid_foreign',
                    'validations_dashboard_uuid_foreign',
                ];
                if (
                    error instanceof DatabaseError &&
                    error.code === FOREIGN_KEY_VIOLATION_ERROR_CODE &&
                    error.constraint &&
                    handledConstraints.includes(error.constraint)
                ) {
                    Logger.warn(
                        `Failed to insert validations: Foreign key constraint violation (${error.constraint}). This may happen if the project, chart, or dashboard was deleted during validation.`,
                    );
                    return;
                }
                throw error;
            }
        }
    }

    async replaceProjectValidations(
        projectUuid: string,
        validations: CreateValidation[],
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            // Lock the project to avoid concurrent validation updates
            await trx(ProjectTableName)
                .where('project_uuid', projectUuid)
                .forUpdate();

            await trx(ValidationTableName)
                .where({ project_uuid: projectUuid })
                .delete();

            if (validations.length > 0) {
                await ValidationModel.create(trx, validations);
            }
        });
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

    public static parseDashboardFilterError(error: string): {
        tableName?: string;
        dashboardFilterErrorType?: DashboardFilterValidationErrorType;
    } {
        // Parse "Filter error: the field 'X' references table 'Y' which is not used by any chart on this dashboard"
        const tableNotUsedMatch = error.match(
            /references table '([^']+)' which is not used by any chart on this dashboard/,
        );
        if (tableNotUsedMatch) {
            return {
                tableName: tableNotUsedMatch[1],
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.TableNotUsedByAnyChart,
            };
        }

        // Parse "Table 'X' no longer exists"
        const tableNotExistMatch = error.match(
            /Table '([^']+)' no longer exists/,
        );
        if (tableNotExistMatch) {
            return {
                tableName: tableNotExistMatch[1],
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.TableDoesNotExist,
            };
        }

        // Parse "Filter error: the field 'X' no longer exists"
        const fieldNotExistMatch = error.match(
            /the field '([^']+)' no longer exists/,
        );
        if (fieldNotExistMatch) {
            return {
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.FieldDoesNotExist,
            };
        }

        return {};
    }

    async get(
        projectUuid: string,
        jobId?: string,
    ): Promise<ValidationResponse[]> {
        // Alias for dashboard space to distinguish from chart's direct space
        const dashboardSpaceAlias = 'dashboard_space';

        const chartValidationErrorsRows = await this.database(
            ValidationTableName,
        )
            .leftJoin(SavedChartsTableName, function nonDeletedChartJoin() {
                this.on(
                    `${SavedChartsTableName}.saved_query_uuid`,
                    '=',
                    `${ValidationTableName}.saved_chart_uuid`,
                ).andOnNull(`${SavedChartsTableName}.deleted_at`);
            })
            // Join to chart's direct space (for charts saved directly in a space)
            .leftJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${SavedChartsTableName}.space_id`,
            )
            // Join to dashboard's space for charts saved in dashboards (space_id is NULL)
            // Uses saved_charts.dashboard_uuid which directly references the dashboard
            .leftJoin(DashboardsTableName, function nonDeletedDashboardJoin() {
                this.on(
                    `${DashboardsTableName}.dashboard_uuid`,
                    '=',
                    `${SavedChartsTableName}.dashboard_uuid`,
                ).andOnNull(`${DashboardsTableName}.deleted_at`);
            })
            .leftJoin(
                `${SpaceTableName} as ${dashboardSpaceAlias}`,
                `${dashboardSpaceAlias}.space_id`,
                `${DashboardsTableName}.space_id`,
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
                // Use chart's direct space if available, otherwise use dashboard's space
                this.database.raw(
                    `COALESCE(${SpaceTableName}.space_uuid, ${dashboardSpaceAlias}.space_uuid) as space_uuid`,
                ),
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

        const dashboardValidationErrorsRows = await this.database(
            ValidationTableName,
        )
            .leftJoin(DashboardsTableName, function nonDeletedDashboardJoin() {
                this.on(
                    `${DashboardsTableName}.dashboard_uuid`,
                    '=',
                    `${ValidationTableName}.dashboard_uuid`,
                ).andOnNull(`${DashboardsTableName}.deleted_at`);
            })
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
            .select<
                (DbValidationTable &
                    Pick<DashboardTable['base'], 'name' | 'views_count'> &
                    Pick<UserTable['base'], 'first_name' | 'last_name'> &
                    Pick<DbSpace, 'space_uuid'> & {
                        last_updated_at: Date;
                    })[]
            >([
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
            dashboardValidationErrorsRows.map((validationError) => {
                const parsedError = ValidationModel.parseDashboardFilterError(
                    validationError.error,
                );
                return {
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
                    tableName: parsedError.tableName,
                    dashboardFilterErrorType:
                        parsedError.dashboardFilterErrorType,
                };
            });

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

    private static mapRowToValidationResponse(
        row: NormalizedValidationRow,
    ): ValidationResponse {
        if (row.source === ValidationSourceType.Chart) {
            return {
                validationId: row.validation_id,
                createdAt: row.created_at,
                projectUuid: row.project_uuid,
                error: row.error,
                errorType: row.error_type,
                source: ValidationSourceType.Chart,
                fieldName: row.field_name ?? undefined,
                chartUuid: row.saved_chart_uuid!,
                chartViews: row.views_count ?? 0,
                chartKind:
                    (row.last_version_chart_kind as ChartKind) ||
                    ChartKind.VERTICAL_BAR,
                name: row.resource_name || 'Chart does not exist',
                lastUpdatedBy: row.first_name
                    ? `${row.first_name} ${row.last_name}`
                    : undefined,
                lastUpdatedAt: row.last_updated_at ?? undefined,
                spaceUuid: row.space_uuid ?? undefined,
                chartName: row.chart_name ?? undefined,
            };
        }

        if (row.source === ValidationSourceType.Dashboard) {
            const parsedError = ValidationModel.parseDashboardFilterError(
                row.error,
            );
            return {
                validationId: row.validation_id,
                createdAt: row.created_at,
                projectUuid: row.project_uuid,
                error: row.error,
                errorType: row.error_type,
                source: ValidationSourceType.Dashboard,
                fieldName: row.field_name ?? undefined,
                dashboardUuid: row.dashboard_uuid!,
                dashboardViews: row.views_count ?? 0,
                name: row.resource_name || 'Dashboard does not exist',
                lastUpdatedBy: row.first_name
                    ? `${row.first_name} ${row.last_name}`
                    : undefined,
                lastUpdatedAt: row.last_updated_at ?? undefined,
                spaceUuid: row.space_uuid ?? undefined,
                chartName: row.chart_name ?? undefined,
                tableName: parsedError.tableName,
                dashboardFilterErrorType: parsedError.dashboardFilterErrorType,
            };
        }

        return {
            validationId: row.validation_id,
            createdAt: row.created_at,
            projectUuid: row.project_uuid,
            error: row.error,
            errorType: row.error_type,
            source: ValidationSourceType.Table,
            name: row.model_name ?? undefined,
        };
    }

    async getFullById(
        validationId: number,
        options?: {
            allowedSpaceUuids?: string[] | 'all';
        },
    ): Promise<ValidationResponse | undefined> {
        const allowedSpaceUuids = options?.allowedSpaceUuids ?? 'all';
        const dashboardSpaceAlias = 'dashboard_space';

        const chartSubquery = this.database(ValidationTableName)
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
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SavedChartsTableName}.dashboard_uuid`,
            )
            .leftJoin(
                `${SpaceTableName} as ${dashboardSpaceAlias}`,
                `${dashboardSpaceAlias}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .leftJoin(
                UserTableName,
                `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where(`${ValidationTableName}.validation_id`, validationId)
            .andWhere(
                `${ValidationTableName}.source`,
                ValidationSourceType.Chart,
            )
            .select([
                `${ValidationTableName}.validation_id`,
                `${ValidationTableName}.created_at`,
                `${ValidationTableName}.project_uuid`,
                `${ValidationTableName}.error`,
                `${ValidationTableName}.error_type`,
                `${ValidationTableName}.source`,
                `${ValidationTableName}.field_name`,
                `${ValidationTableName}.chart_name`,
                `${ValidationTableName}.model_name`,
                `${ValidationTableName}.saved_chart_uuid`,
                `${ValidationTableName}.dashboard_uuid`,
                this.database.raw(
                    `COALESCE(${SavedChartsTableName}.name, ${ValidationTableName}.chart_name, 'Chart does not exist') as resource_name`,
                ),
                `${SavedChartsTableName}.views_count`,
                this.database.raw(
                    `${SavedChartsTableName}.last_version_updated_at as last_updated_at`,
                ),
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                this.database.raw(
                    `COALESCE(${SpaceTableName}.space_uuid, ${dashboardSpaceAlias}.space_uuid) as space_uuid`,
                ),
                `${SavedChartsTableName}.last_version_chart_kind`,
            ]);

        const dashboardSubquery = this.database(ValidationTableName)
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
                DashboardVersionsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DashboardVersionsTableName}.updated_by_user_uuid`,
            )
            .where(`${ValidationTableName}.validation_id`, validationId)
            .andWhere(
                `${ValidationTableName}.source`,
                ValidationSourceType.Dashboard,
            )
            .select([
                `${ValidationTableName}.validation_id`,
                `${ValidationTableName}.created_at`,
                `${ValidationTableName}.project_uuid`,
                `${ValidationTableName}.error`,
                `${ValidationTableName}.error_type`,
                `${ValidationTableName}.source`,
                `${ValidationTableName}.field_name`,
                `${ValidationTableName}.chart_name`,
                `${ValidationTableName}.model_name`,
                `${ValidationTableName}.saved_chart_uuid`,
                `${ValidationTableName}.dashboard_uuid`,
                this.database.raw(
                    `COALESCE(${DashboardsTableName}.name, ${ValidationTableName}.model_name, 'Dashboard does not exist') as resource_name`,
                ),
                `${DashboardsTableName}.views_count`,
                this.database.raw(
                    `${DashboardVersionsTableName}.created_at as last_updated_at`,
                ),
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${SpaceTableName}.space_uuid`,
                this.database.raw('NULL::text as last_version_chart_kind'),
            ])
            .orderBy(`${DashboardVersionsTableName}.dashboard_id`, 'desc')
            .limit(1);

        const tableSubquery = this.database(ValidationTableName)
            .where(`${ValidationTableName}.validation_id`, validationId)
            .andWhere(
                `${ValidationTableName}.source`,
                ValidationSourceType.Table,
            )
            .select([
                `${ValidationTableName}.validation_id`,
                `${ValidationTableName}.created_at`,
                `${ValidationTableName}.project_uuid`,
                `${ValidationTableName}.error`,
                `${ValidationTableName}.error_type`,
                `${ValidationTableName}.source`,
                `${ValidationTableName}.field_name`,
                `${ValidationTableName}.chart_name`,
                `${ValidationTableName}.model_name`,
                `${ValidationTableName}.saved_chart_uuid`,
                `${ValidationTableName}.dashboard_uuid`,
                this.database.raw(
                    `${ValidationTableName}.model_name as resource_name`,
                ),
                this.database.raw('NULL::integer as views_count'),
                this.database.raw('NULL::timestamp as last_updated_at'),
                this.database.raw('NULL::text as first_name'),
                this.database.raw('NULL::text as last_name'),
                this.database.raw('NULL::uuid as space_uuid'),
                this.database.raw('NULL::text as last_version_chart_kind'),
            ]);

        const rows: NormalizedValidationRow[] = await this.database
            .with('chart_errors', chartSubquery)
            .with('dashboard_errors', dashboardSubquery)
            .with('table_errors', tableSubquery)
            .with(
                'all_errors',
                this.database.raw(
                    'SELECT * FROM chart_errors UNION ALL SELECT * FROM dashboard_errors UNION ALL SELECT * FROM table_errors',
                ),
            )
            .from('all_errors')
            .select('*')
            .modify((qb) => {
                if (allowedSpaceUuids !== 'all') {
                    void qb.where((inner) => {
                        void inner
                            .whereIn('space_uuid', allowedSpaceUuids)
                            .orWhere('source', ValidationSourceType.Table);
                    });
                }
            })
            .limit(1);

        const row = rows[0];
        if (!row) {
            return undefined;
        }

        return ValidationModel.mapRowToValidationResponse(row);
    }

    async getPaginated(
        projectUuid: string,
        paginateArgs: KnexPaginateArgs,
        options?: {
            searchQuery?: string;
            sortBy?: 'name' | 'createdAt' | 'errorType' | 'source';
            sortDirection?: 'asc' | 'desc';
            sourceTypes?: ValidationSourceType[];
            errorTypes?: ValidationErrorType[];
            includeChartConfigWarnings?: boolean;
            allowedSpaceUuids?: string[] | 'all';
            jobId?: string;
        },
    ): Promise<KnexPaginatedData<ValidationResponse[]>> {
        const {
            searchQuery,
            sortBy = 'createdAt',
            sortDirection = 'desc',
            sourceTypes,
            errorTypes,
            includeChartConfigWarnings = false,
            allowedSpaceUuids = 'all',
            jobId,
        } = options ?? {};

        const dashboardSpaceAlias = 'dashboard_space';

        const jobFilter = (qb: Knex.QueryBuilder) => {
            if (jobId) {
                void qb.where(`${ValidationTableName}.job_id`, jobId);
            } else {
                void qb.whereNull(`${ValidationTableName}.job_id`);
            }
        };

        const chartSubquery = this.database(ValidationTableName)
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
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SavedChartsTableName}.dashboard_uuid`,
            )
            .leftJoin(
                `${SpaceTableName} as ${dashboardSpaceAlias}`,
                `${dashboardSpaceAlias}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .leftJoin(
                UserTableName,
                `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where(`${ValidationTableName}.project_uuid`, projectUuid)
            .andWhere(
                `${ValidationTableName}.source`,
                ValidationSourceType.Chart,
            )
            .andWhere(jobFilter)
            .whereNotNull(`${SavedChartsTableName}.saved_query_uuid`)
            .select([
                `${ValidationTableName}.validation_id`,
                `${ValidationTableName}.created_at`,
                `${ValidationTableName}.project_uuid`,
                `${ValidationTableName}.error`,
                `${ValidationTableName}.error_type`,
                `${ValidationTableName}.source`,
                `${ValidationTableName}.field_name`,
                `${ValidationTableName}.chart_name`,
                `${ValidationTableName}.model_name`,
                `${ValidationTableName}.saved_chart_uuid`,
                `${ValidationTableName}.dashboard_uuid`,
                this.database.raw(
                    `COALESCE(${SavedChartsTableName}.name, ${ValidationTableName}.chart_name, 'Chart does not exist') as resource_name`,
                ),
                `${SavedChartsTableName}.views_count`,
                this.database.raw(
                    `${SavedChartsTableName}.last_version_updated_at as last_updated_at`,
                ),
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                this.database.raw(
                    `COALESCE(${SpaceTableName}.space_uuid, ${dashboardSpaceAlias}.space_uuid) as space_uuid`,
                ),
                `${SavedChartsTableName}.last_version_chart_kind`,
            ])
            .distinctOn([
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.saved_query_id`,
                `${ValidationTableName}.error`,
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
            ]);

        const dashboardSubquery = this.database(ValidationTableName)
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
                DashboardVersionsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DashboardVersionsTableName}.updated_by_user_uuid`,
            )
            .where(`${ValidationTableName}.project_uuid`, projectUuid)
            .andWhere(
                `${ValidationTableName}.source`,
                ValidationSourceType.Dashboard,
            )
            .andWhere(jobFilter)
            .whereNotNull(`${DashboardsTableName}.dashboard_uuid`)
            .select([
                `${ValidationTableName}.validation_id`,
                `${ValidationTableName}.created_at`,
                `${ValidationTableName}.project_uuid`,
                `${ValidationTableName}.error`,
                `${ValidationTableName}.error_type`,
                `${ValidationTableName}.source`,
                `${ValidationTableName}.field_name`,
                `${ValidationTableName}.chart_name`,
                `${ValidationTableName}.model_name`,
                `${ValidationTableName}.saved_chart_uuid`,
                `${ValidationTableName}.dashboard_uuid`,
                this.database.raw(
                    `COALESCE(${DashboardsTableName}.name, ${ValidationTableName}.model_name, 'Dashboard does not exist') as resource_name`,
                ),
                `${DashboardsTableName}.views_count`,
                this.database.raw(
                    `${DashboardVersionsTableName}.created_at as last_updated_at`,
                ),
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${SpaceTableName}.space_uuid`,
                this.database.raw('NULL::text as last_version_chart_kind'),
            ])
            .distinctOn([
                `${DashboardsTableName}.name`,
                `${DashboardVersionsTableName}.dashboard_id`,
                `${ValidationTableName}.error`,
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
            ]);

        const tableSubquery = this.database(ValidationTableName)
            .where(`${ValidationTableName}.project_uuid`, projectUuid)
            .andWhere(
                `${ValidationTableName}.source`,
                ValidationSourceType.Table,
            )
            .andWhere(jobFilter)
            .select([
                `${ValidationTableName}.validation_id`,
                `${ValidationTableName}.created_at`,
                `${ValidationTableName}.project_uuid`,
                `${ValidationTableName}.error`,
                `${ValidationTableName}.error_type`,
                `${ValidationTableName}.source`,
                `${ValidationTableName}.field_name`,
                `${ValidationTableName}.chart_name`,
                `${ValidationTableName}.model_name`,
                `${ValidationTableName}.saved_chart_uuid`,
                `${ValidationTableName}.dashboard_uuid`,
                this.database.raw(
                    `${ValidationTableName}.model_name as resource_name`,
                ),
                this.database.raw('NULL::integer as views_count'),
                this.database.raw('NULL::timestamp as last_updated_at'),
                this.database.raw('NULL::text as first_name'),
                this.database.raw('NULL::text as last_name'),
                this.database.raw('NULL::uuid as space_uuid'),
                this.database.raw('NULL::text as last_version_chart_kind'),
            ])
            .distinctOn(`${ValidationTableName}.error`)
            .orderBy(`${ValidationTableName}.error`, 'asc');

        const sortColumnMap: Record<string, string> = {
            name: 'resource_name',
            createdAt: 'created_at',
            errorType: 'error_type',
            source: 'source',
        };
        const sortColumn = sortColumnMap[sortBy] || 'created_at';

        const rows: (NormalizedValidationRow & { total_count: string })[] =
            await this.database
                .with('chart_errors', chartSubquery)
                .with('dashboard_errors', dashboardSubquery)
                .with('table_errors', tableSubquery)
                .with(
                    'all_errors',
                    this.database.raw(
                        'SELECT * FROM chart_errors UNION ALL SELECT * FROM dashboard_errors UNION ALL SELECT * FROM table_errors',
                    ),
                )
                .from('all_errors')
                .select('*')
                .select(this.database.raw('COUNT(*) OVER() as total_count'))
                .modify((qb) => {
                    if (searchQuery) {
                        void qb.where((inner) => {
                            void inner
                                .where(
                                    'resource_name',
                                    'ILIKE',
                                    `%${searchQuery}%`,
                                )
                                .orWhere('error', 'ILIKE', `%${searchQuery}%`);
                        });
                    }
                    if (sourceTypes && sourceTypes.length > 0) {
                        void qb.whereIn('source', sourceTypes);
                    }
                    if (errorTypes && errorTypes.length > 0) {
                        void qb.whereIn('error_type', errorTypes);
                    }
                    if (!includeChartConfigWarnings) {
                        void qb.whereNot((inner) => {
                            void inner
                                .where('source', ValidationSourceType.Chart)
                                .andWhere(
                                    'error_type',
                                    ValidationErrorType.ChartConfiguration,
                                );
                        });
                    }
                    if (allowedSpaceUuids !== 'all') {
                        void qb.where((inner) => {
                            void inner
                                .whereIn('space_uuid', allowedSpaceUuids)
                                .orWhere('source', ValidationSourceType.Table);
                        });
                    }
                })
                .orderBy(sortColumn, sortDirection)
                .limit(paginateArgs.pageSize)
                .offset((paginateArgs.page - 1) * paginateArgs.pageSize);

        const totalCount =
            rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;

        const data: ValidationResponse[] = rows.map(
            ValidationModel.mapRowToValidationResponse,
        );

        return {
            data,
            pagination: {
                page: paginateArgs.page,
                pageSize: paginateArgs.pageSize,
                totalPageCount: Math.ceil(totalCount / paginateArgs.pageSize),
                totalResults: totalCount,
            },
        };
    }
}
