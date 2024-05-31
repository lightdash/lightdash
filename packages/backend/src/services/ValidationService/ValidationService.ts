import { subject } from '@casl/ability';
import {
    assertUnreachable,
    CompiledField,
    CreateChartValidation,
    CreateDashboardValidation,
    CreateTableValidation,
    CreateValidation,
    DashboardTileTarget,
    Explore,
    ExploreError,
    ForbiddenError,
    getFilterRules,
    getItemId,
    InlineErrorType,
    isExploreError,
    OrganizationMemberRole,
    RequestMethod,
    SessionUser,
    TableCalculation,
    TableSelectionType,
    ValidationErrorType,
    ValidationResponse,
    ValidationSourceType,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { ValidationModel } from '../../models/ValidationModel/ValidationModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';

type ValidationServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    validationModel: ValidationModel;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    schedulerClient: SchedulerClient;
};

export class ValidationService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    validationModel: ValidationModel;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    schedulerClient: SchedulerClient;

    constructor({
        lightdashConfig,
        analytics,
        validationModel,
        projectModel,
        savedChartModel,
        dashboardModel,
        spaceModel,
        schedulerClient,
    }: ValidationServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.validationModel = validationModel;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.schedulerClient = schedulerClient;
    }

    private static getTableCalculationFieldIds(
        tableCalculations: TableCalculation[],
    ): string[] {
        const parseTableField = (field: string) =>
            // Transform ${table.field} references on table calculation to table_field
            field.replace('${', '').replace('}', '').replace('.', '_');

        const tableCalculationFieldsInSql: string[] = tableCalculations.reduce<
            string[]
        >((acc, tc) => {
            const regex = /\$\{([^}]+)\}/g;

            const fieldsInSql = tc.sql.match(regex);
            if (fieldsInSql != null) {
                return [...acc, ...fieldsInSql.map(parseTableField)];
            }
            return acc;
        }, []);
        return tableCalculationFieldsInSql;
    }

    private async validateTables(
        projectUuid: string,
        explores: (Explore | ExploreError)[] | undefined,
    ): Promise<CreateTableValidation[]> {
        const tablesConfiguration =
            await this.projectModel.getTablesConfiguration(projectUuid);

        // Get existing errors from ExploreError and convert to ValidationInsert
        if (explores === undefined) {
            return [];
        }

        const isTableEnabled = (explore: Explore | ExploreError) => {
            switch (tablesConfiguration.tableSelection.type) {
                case TableSelectionType.ALL:
                    return true;
                case TableSelectionType.WITH_TAGS:
                    const hasSelectedJoinedExploredWithTags = explores.some(
                        (e) =>
                            e.joinedTables?.some(
                                (jt) => jt.table === explore.name,
                            ) &&
                            e.tags?.some((tag) =>
                                tablesConfiguration.tableSelection.value?.includes(
                                    tag,
                                ),
                            ),
                    );
                    const exploreIsSelectedWithTags = explore.tags?.some(
                        (tag) =>
                            tablesConfiguration.tableSelection.value?.includes(
                                tag,
                            ),
                    );
                    return (
                        hasSelectedJoinedExploredWithTags ||
                        exploreIsSelectedWithTags
                    );

                case TableSelectionType.WITH_NAMES:
                    const hasSelectedJoinedExplored = explores.some(
                        (e) =>
                            e.joinedTables?.some(
                                (jt) => jt.table === explore.name,
                            ) &&
                            tablesConfiguration.tableSelection.value?.includes(
                                e.name,
                            ),
                    );
                    const exploreIsSelected =
                        tablesConfiguration.tableSelection.value?.includes(
                            explore.name,
                        );

                    return hasSelectedJoinedExplored || exploreIsSelected;
                default:
                    return assertUnreachable(
                        tablesConfiguration.tableSelection.type,
                        'Invalid table selection type',
                    );
            }
        };

        const errors = explores.reduce<CreateTableValidation[]>(
            (acc, explore) => {
                if (!isTableEnabled(explore)) {
                    this.logger.debug(
                        `Table ${explore.name} is disabled, skipping validation`,
                    );
                    return acc;
                }
                if (isExploreError(explore)) {
                    const exploreErrors = explore.errors
                        .filter(
                            (error) =>
                                error.type !==
                                InlineErrorType.NO_DIMENSIONS_FOUND,
                        )
                        .map((ee) => ({
                            name: explore.name,
                            error: ee.message,
                            errorType: ValidationErrorType.Model,
                            modelName: explore.name,
                            projectUuid,
                            source: ValidationSourceType.Table,
                        }));
                    return [...acc, ...exploreErrors];
                }
                return acc;
            },
            [],
        );
        return errors;
    }

    private async validateCharts(
        projectUuid: string,
        exploreFields: Record<
            string,
            { dimensionIds: string[]; metricIds: string[] }
        >,
    ): Promise<CreateChartValidation[]> {
        const charts = await this.savedChartModel.findChartsForValidation(
            projectUuid,
        );

        const results = charts.flatMap(
            ({
                uuid,
                name,
                tableName,
                sorts,
                filters,
                dimensions,
                metrics,
                customBinDimensions,
                customSqlDimensions,
                customMetrics,
                customMetricsBaseDimensions,
                tableCalculations,
            }) => {
                const availableDimensionIds =
                    exploreFields[tableName]?.dimensionIds || [];
                const availableCustomDimensionIds = [
                    ...customBinDimensions,
                    ...customSqlDimensions,
                ];
                const availableMetricIds =
                    exploreFields[tableName]?.metricIds || [];

                const allItemIdsAvailableInChart = [
                    ...availableDimensionIds,
                    ...availableMetricIds,
                    ...tableCalculations,
                    ...customMetrics,
                    ...availableCustomDimensionIds,
                ];

                const commonValidation = {
                    chartUuid: uuid,
                    name,
                    projectUuid,
                    source: ValidationSourceType.Chart,
                    chartName: name,
                };
                const containsFieldId = ({
                    acc,
                    fieldIds,
                    fieldId,
                    error,
                    errorType,
                    fieldName,
                }: {
                    acc: CreateChartValidation[];
                    fieldIds: string[];
                    fieldId: string;
                } & Pick<
                    CreateChartValidation,
                    'error' | 'errorType' | 'fieldName'
                >) => {
                    if (!fieldIds?.includes(fieldId)) {
                        return [
                            ...acc,
                            {
                                ...commonValidation,
                                errorType,
                                error,
                                fieldName,
                            },
                        ];
                    }
                    return acc;
                };

                const dimensionErrors = dimensions.reduce<
                    CreateChartValidation[]
                >(
                    (acc, field) =>
                        containsFieldId({
                            acc,
                            fieldIds: [
                                ...availableDimensionIds,
                                ...availableCustomDimensionIds,
                            ],
                            fieldId: field,
                            error: `Dimension error: the field '${field}' no longer exists`,
                            errorType: ValidationErrorType.Dimension,
                            fieldName: field,
                        }),
                    [],
                );
                const metricErrors = metrics.reduce<CreateChartValidation[]>(
                    (acc, field) =>
                        containsFieldId({
                            acc,
                            fieldIds: [...availableMetricIds, ...customMetrics],
                            fieldId: field,
                            error: `Metric error: the field '${field}' no longer exists`,
                            errorType: ValidationErrorType.Metric,
                            fieldName: field,
                        }),
                    [],
                );
                const customMetricsErrors = customMetricsBaseDimensions.reduce<
                    CreateChartValidation[]
                >(
                    (acc, field) =>
                        containsFieldId({
                            acc,
                            fieldIds: [
                                ...availableDimensionIds,
                                ...availableCustomDimensionIds, // Custom dimensions can be used as base dimensions for custom metrics
                            ],
                            fieldId: field,
                            error: `Custom metric error: the base dimension '${field}' no longer exists`,
                            errorType: ValidationErrorType.CustomMetric,
                            fieldName: field,
                        }),

                    [],
                );

                const filterErrors = getFilterRules(filters).reduce<
                    CreateChartValidation[]
                >(
                    (acc, field) =>
                        containsFieldId({
                            acc,
                            fieldIds: allItemIdsAvailableInChart,
                            fieldId: field.target.fieldId,
                            error: `Filter error: the field '${field.target.fieldId}' no longer exists`,
                            errorType: ValidationErrorType.Filter,
                            fieldName: field.target.fieldId,
                        }),
                    [],
                );

                const sortErrors = sorts.reduce<CreateChartValidation[]>(
                    (acc, field) =>
                        containsFieldId({
                            acc,
                            fieldIds: allItemIdsAvailableInChart,
                            fieldId: field,
                            error: `Sorting error: the field '${field}' no longer exists`,
                            errorType: ValidationErrorType.Sorting,
                            fieldName: field,
                        }),
                    [],
                );

                return [
                    ...dimensionErrors,
                    ...metricErrors,
                    ...filterErrors,
                    ...sortErrors,
                    ...customMetricsErrors,
                ];
            },
        );

        return results;
    }

    private async validateDashboards(
        projectUuid: string,
        existingFields: CompiledField[],
        brokenCharts: Pick<CreateChartValidation, 'chartUuid' | 'name'>[],
    ): Promise<CreateDashboardValidation[]> {
        const existingFieldIds = existingFields.map(getItemId);

        const dashboardsToValidate =
            await this.dashboardModel.findDashboardsForValidation(projectUuid);
        const results: CreateDashboardValidation[] =
            dashboardsToValidate.flatMap(
                ({ name, dashboardUuid, filters, chartUuids }) => {
                    const commonValidation = {
                        name,
                        dashboardUuid,
                        projectUuid,
                        source: ValidationSourceType.Dashboard,
                    };

                    const containsFieldId = ({
                        acc,
                        fieldIds,
                        fieldId,
                        error,
                        errorType,
                        fieldName,
                    }: {
                        acc: CreateDashboardValidation[];
                        fieldIds: string[];
                        fieldId: string;
                    } & Pick<
                        CreateDashboardValidation,
                        'error' | 'errorType' | 'fieldName'
                    >) => {
                        if (!fieldIds?.includes(fieldId)) {
                            return [
                                ...acc,
                                {
                                    ...commonValidation,
                                    errorType,
                                    error,
                                    fieldName,
                                },
                            ];
                        }
                        return acc;
                    };

                    const dashboardFilterRules = [
                        ...filters.dimensions,
                        ...filters.metrics,
                    ];
                    const filterErrors = dashboardFilterRules.reduce<
                        CreateDashboardValidation[]
                    >(
                        (acc, filter) =>
                            containsFieldId({
                                acc,
                                fieldIds: existingFieldIds,
                                fieldId: filter.target.fieldId,
                                error: `Filter error: the field '${filter.target.fieldId}' no longer exists`,
                                errorType: ValidationErrorType.Filter,
                                fieldName: filter.target.fieldId,
                            }),
                        [],
                    );

                    const dashboardTileTargets = dashboardFilterRules.reduce<
                        DashboardTileTarget[]
                    >((acc, t) => {
                        if (t.tileTargets) {
                            const targets = Object.values(t.tileTargets);
                            return [...acc, ...targets];
                        }
                        return acc;
                    }, []);
                    const tileTargetErrors = dashboardTileTargets.reduce<
                        CreateDashboardValidation[]
                    >(
                        (acc, tileTarget) => {
                            if (tileTarget) {
                                return containsFieldId({
                                    acc,
                                    fieldIds: existingFieldIds,
                                    fieldId: tileTarget.fieldId,
                                    error: `Filter error: the field '${tileTarget.fieldId}' no longer exists`,
                                    errorType: ValidationErrorType.Filter,
                                    fieldName: tileTarget.fieldId,
                                });
                            }
                            return acc;
                        },

                        [],
                    );

                    const chartErrors = chartUuids.reduce<
                        CreateDashboardValidation[]
                    >((acc, savedChartUuid) => {
                        const brokenChart = brokenCharts.find(
                            (c) => c.chartUuid === savedChartUuid,
                        );
                        if (brokenChart !== undefined) {
                            return [
                                ...acc,
                                {
                                    ...commonValidation,
                                    error: `The chart '${brokenChart.name}' is broken on this dashboard.`,
                                    errorType: ValidationErrorType.Chart,
                                    chartName: brokenChart.name,
                                },
                            ];
                        }
                        return acc;
                    }, []);

                    return [
                        ...filterErrors,
                        ...tileTargetErrors,
                        ...chartErrors,
                    ];
                },
            );

        return results;
    }

    async generateValidation(
        projectUuid: string,
        compiledExplores?: (Explore | ExploreError)[],
    ): Promise<CreateValidation[]> {
        this.logger.debug(
            `Generating validation for project ${projectUuid} with explores ${
                compiledExplores ? 'from CLI' : 'from cache'
            }`,
        );
        const explores =
            compiledExplores !== undefined
                ? compiledExplores
                : await this.projectModel.getExploresFromCache(projectUuid);

        const exploreFields =
            explores?.reduce<
                Record<string, { dimensionIds: string[]; metricIds: string[] }>
            >((acc, explore) => {
                if (isExploreError(explore) || explore?.tables === undefined)
                    return acc;
                const dimensions = Object.values(explore.tables).flatMap(
                    (table) => Object.values(table.dimensions),
                );
                const metrics = Object.values(explore.tables).flatMap((table) =>
                    Object.values(table.metrics),
                );
                return {
                    ...acc,
                    [explore.baseTable]: {
                        dimensionIds: dimensions.map(getItemId),
                        metricIds: metrics.map(getItemId),
                    },
                };
            }, {}) || {};

        const existingFields = explores?.reduce<CompiledField[]>(
            (acc, explore) => {
                if (!explore.tables) return acc;

                const fields = Object.values(explore.tables).flatMap(
                    (table) => [
                        ...Object.values(table.dimensions),
                        ...Object.values(table.metrics),
                    ],
                );

                return [...acc, ...fields];
            },
            [],
        );

        if (!existingFields) {
            this.logger.warn(
                `No fields found for project validation ${projectUuid}`,
            );
            return [];
        }

        const tableErrors = await this.validateTables(projectUuid, explores);
        const chartErrors = await this.validateCharts(
            projectUuid,
            exploreFields,
        );
        const dashboardErrors = await this.validateDashboards(
            projectUuid,
            existingFields,
            chartErrors,
        );
        const validationErrors = [
            ...tableErrors,
            ...chartErrors,
            ...dashboardErrors,
        ];

        return validationErrors;
    }

    async validate(
        user: SessionUser,
        projectUuid: string,
        context?: RequestMethod,
        explores?: (Explore | ExploreError)[],
    ): Promise<string> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const fromCLI =
            context === RequestMethod.CLI_CI || context === RequestMethod.CLI;
        const jobId = await this.schedulerClient.generateValidation({
            userUuid: user.userUuid,
            projectUuid,
            context: fromCLI ? 'cli' : 'lightdash_app',
            organizationUuid: user.organizationUuid,
            explores,
        });
        return jobId;
    }

    async storeValidation(
        projectUuid: string,
        validationErrors: CreateValidation[],
        jobId?: string,
    ) {
        // If not storing for an specific CLI validation, delete previous validations
        if (jobId === undefined) await this.validationModel.delete(projectUuid);

        if (validationErrors.length > 0)
            await this.validationModel.create(validationErrors, jobId);
    }

    async hidePrivateContent(
        user: SessionUser,
        projectUuid: string,
        validations: ValidationResponse[],
    ): Promise<ValidationResponse[]> {
        if (user.role === OrganizationMemberRole.ADMIN) return validations;

        const spaces = await this.spaceModel.find({ projectUuid });
        // Filter private content to developers
        return Promise.all(
            validations.map(async (validation) => {
                const space = spaces.find(
                    (s) => s.uuid === validation.spaceUuid,
                );
                const hasAccess =
                    space &&
                    hasViewAccessToSpace(
                        user,
                        space,
                        await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            space.uuid,
                        ),
                    );
                if (hasAccess) return validation;

                return {
                    ...validation,
                    chartUuid: undefined,
                    dashboardUuid: undefined,
                    name: 'Private content',
                };
            }),
        );
    }

    async get(
        user: SessionUser,
        projectUuid: string,
        fromSettings = false,
        jobId?: string,
    ): Promise<ValidationResponse[]> {
        const { organizationUuid } = user;

        if (
            user.ability.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const validations = await this.validationModel.get(projectUuid, jobId);

        if (fromSettings) {
            const contentIds = validations.map(
                (validation) =>
                    // NOTE: chart and dashboard uuids might be undefined for private content, so default to name if not present
                    ('chartUuid' in validation && validation.chartUuid) ||
                    ('dashboardUuid' in validation &&
                        validation.dashboardUuid) ||
                    validation.name,
            );

            this.analytics.track({
                event: 'validation.page_viewed',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    numErrorsDetected: validations.length,
                    numContentAffected: new Set(contentIds).size,
                },
            });
        }

        return this.hidePrivateContent(user, projectUuid, validations);
    }

    async getJob(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ValidationResponse[]> {
        const validations = await this.validationModel.get(projectUuid);
        return this.hidePrivateContent(user, projectUuid, validations);
    }

    async delete(user: SessionUser, validationId: number): Promise<void> {
        const validation = await this.validationModel.getByValidationId(
            validationId,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid: user.organizationUuid,
                    projectUuid: validation.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        this.analytics.track({
            event: 'validation.error_dismissed',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid,
                projectId: validation.projectUuid,
            },
        });

        await this.validationModel.deleteValidation(validationId);
    }
}
