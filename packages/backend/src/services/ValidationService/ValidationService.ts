import { subject } from '@casl/ability';
import {
    assertUnreachable,
    CompiledField,
    convertFieldRefToFieldId,
    CreateChartValidation,
    CreateDashboardValidation,
    CreateTableValidation,
    CreateValidation,
    DashboardTileTarget,
    Explore,
    ExploreError,
    ExploreType,
    FeatureFlags,
    ForbiddenError,
    getFilterRules,
    getItemId,
    getUnusedDimensions,
    getUnusedTableCalculations,
    InlineErrorType,
    isChartValidationError,
    isDashboardFieldTarget,
    isDashboardValidationError,
    isExploreError,
    isSqlTableCalculation,
    isTableValidationError,
    isTemplateTableCalculation,
    isValidationTargetValid,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotFoundError,
    OrganizationMemberRole,
    RequestMethod,
    SessionUser,
    TableCalculation,
    TableSelectionType,
    UnexpectedServerError,
    ValidationErrorType,
    ValidationResponse,
    ValidationSourceType,
    ValidationTarget,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { CaslAuditWrapper } from '../../logging/caslAuditWrapper';
import { logAuditEvent } from '../../logging/winston';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { ValidationModel } from '../../models/ValidationModel/ValidationModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';

type ValidationServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    validationModel: ValidationModel;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    schedulerClient: SchedulerClient;
    spacePermissionService: SpacePermissionService;
    featureFlagModel: FeatureFlagModel;
};

export class ValidationService extends BaseService {
    private static buildExploreFields(
        compiledExplores: (Explore | ExploreError)[],
    ): Record<string, { dimensionIds: string[]; metricIds: string[] }> {
        const exploreFields: Record<
            string,
            { dimensionIds: string[]; metricIds: string[] }
        > = {};

        compiledExplores.forEach((explore: Explore | ExploreError) => {
            if (!isExploreError(explore)) {
                // For validation, index by both baseTable and explore name
                const dimensions = Object.values(explore.tables).flatMap(
                    (table) => Object.values(table.dimensions || {}),
                );
                const metrics = Object.values(explore.tables).flatMap((table) =>
                    Object.values(table.metrics || {}),
                );
                const fieldData = {
                    dimensionIds: dimensions.map(getItemId),
                    metricIds: metrics.map(getItemId),
                };
                // Index by baseTable
                exploreFields[explore.baseTable] = fieldData;
                // Also index by explore name if different
                if (explore.name !== explore.baseTable) {
                    exploreFields[explore.name] = fieldData;
                }
            }
        });

        return exploreFields;
    }

    private static buildExistingFields(
        compiledExplores: (Explore | ExploreError)[],
    ): CompiledField[] {
        const existingFields: CompiledField[] = [];

        compiledExplores.forEach((explore: Explore | ExploreError) => {
            if (!isExploreError(explore)) {
                Object.values(explore.tables).forEach((table) => {
                    existingFields.push(
                        ...(Object.values(
                            table.dimensions || {},
                        ) as CompiledField[]),
                    );
                    existingFields.push(
                        ...(Object.values(
                            table.metrics || {},
                        ) as CompiledField[]),
                    );
                });
            }
        });

        return existingFields;
    }

    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    validationModel: ValidationModel;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    schedulerClient: SchedulerClient;

    spacePermissionService: SpacePermissionService;

    featureFlagModel: FeatureFlagModel;

    constructor({
        lightdashConfig,
        analytics,
        validationModel,
        projectModel,
        savedChartModel,
        dashboardModel,
        spaceModel,
        schedulerClient,
        spacePermissionService,
        featureFlagModel,
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
        this.spacePermissionService = spacePermissionService;
        this.featureFlagModel = featureFlagModel;
    }

    static getTableCalculationFieldIds(
        tableCalculations: TableCalculation[],
    ): string[] {
        const parseTableField = (field: string) =>
            // Transform ${table.field} references on table calculation to table_field
            field.replace('${', '').replace('}', '').replace('.', '_');

        const tableCalculationFieldsInSql: string[] = tableCalculations.reduce<
            string[]
        >((acc, tc) => {
            const regex = /\$\{([^}]+)\}/g;

            if (isSqlTableCalculation(tc)) {
                const fieldsInSql = tc.sql.match(regex);
                if (fieldsInSql != null) {
                    return [...acc, ...fieldsInSql.map(parseTableField)];
                }
            }

            if (isTemplateTableCalculation(tc)) {
                const fieldIdPart =
                    'fieldId' in tc.template && tc.template.fieldId !== null
                        ? [tc.template.fieldId]
                        : [];
                const orderByPart =
                    'orderBy' in tc.template
                        ? tc.template.orderBy.map((o) => o.fieldId)
                        : [];
                const partitionByPart =
                    'partitionBy' in tc.template && tc.template.partitionBy
                        ? tc.template.partitionBy
                        : [];
                const fieldsInTemplate = [
                    ...fieldIdPart,
                    ...orderByPart,
                    ...partitionByPart,
                ];
                return [...acc, ...fieldsInTemplate];
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
                            (e.joinedTables?.some(
                                (jt) => jt.table === explore.name,
                            ) &&
                                e.tags?.some((tag) =>
                                    tablesConfiguration.tableSelection.value?.includes(
                                        tag,
                                    ),
                                )) ||
                            explore.type === ExploreType.VIRTUAL, // Custom explores/Virtual views are included by default
                    );
                    const exploreIsSelectedWithTags = explore.tags?.some(
                        (tag) =>
                            tablesConfiguration.tableSelection.value?.includes(
                                tag,
                            ) || explore.type === ExploreType.VIRTUAL, // Custom explores/Virtual views are included by default
                    );
                    return (
                        hasSelectedJoinedExploredWithTags ||
                        exploreIsSelectedWithTags
                    );

                case TableSelectionType.WITH_NAMES:
                    const hasSelectedJoinedExplored = explores.some(
                        (e) =>
                            (e.joinedTables?.some(
                                (jt) => jt.table === explore.name,
                            ) &&
                                tablesConfiguration.tableSelection.value?.includes(
                                    e.name,
                                )) ||
                            explore.type === ExploreType.VIRTUAL, // Custom explores/Virtual views are included by default
                    );
                    const exploreIsSelected =
                        tablesConfiguration.tableSelection.value?.includes(
                            explore.name,
                        ) || explore.type === ExploreType.VIRTUAL; // Custom explores/Virtual views are included by default

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
        selectedExplores?: (Explore | ExploreError)[],
        chartUuid?: string,
    ): Promise<CreateChartValidation[]> {
        const charts = await this.savedChartModel.findChartsForValidation(
            projectUuid,
            chartUuid,
        );

        // Only validate charts that are using selected explores
        const results = charts
            .filter((c) => {
                if (selectedExplores === undefined) return true;
                return selectedExplores.some((explore) => {
                    if (isExploreError(explore)) return false;
                    // Match by baseTable or explore name (for additional explores)
                    return (
                        explore.baseTable === c.tableName ||
                        explore.name === c.tableName
                    );
                });
            })
            .flatMap(
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
                    customMetricsFilters,
                    tableCalculations,
                    chartType,
                    chartConfig,
                    pivotDimensions,
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
                    const metricErrors = metrics.reduce<
                        CreateChartValidation[]
                    >(
                        (acc, field) =>
                            containsFieldId({
                                acc,
                                fieldIds: [
                                    ...availableMetricIds,
                                    ...customMetrics,
                                ],
                                fieldId: field,
                                error: `Metric error: the field '${field}' no longer exists`,
                                errorType: ValidationErrorType.Metric,
                                fieldName: field,
                            }),
                        [],
                    );
                    const customMetricsErrors =
                        customMetricsBaseDimensions.reduce<
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
                    >((acc, field) => {
                        try {
                            return containsFieldId({
                                acc,
                                fieldIds: allItemIdsAvailableInChart,
                                fieldId: field.target?.fieldId,
                                error: `Filter error: the field '${field.target?.fieldId}' no longer exists`,
                                errorType: ValidationErrorType.Filter,
                                fieldName: field.target?.fieldId,
                            });
                        } catch (e) {
                            console.error(
                                'Unexpected validation error on filterErrors with filter',
                                field,
                                e,
                            );
                            return acc;
                        }
                    }, []);

                    const customMetricFilterErrors = customMetricsFilters
                        .filter((f) => !!f)
                        .reduce<CreateChartValidation[]>((acc, filter) => {
                            try {
                                const fieldId = convertFieldRefToFieldId(
                                    filter.target.fieldRef,
                                );
                                return containsFieldId({
                                    acc,
                                    fieldIds: allItemIdsAvailableInChart,
                                    fieldId,
                                    error: `Custom metric filter error: the field '${fieldId}' no longer exists`,
                                    errorType: ValidationErrorType.CustomMetric,
                                    fieldName: fieldId,
                                });
                            } catch (e) {
                                console.error(
                                    'Unexpected validation error on customMetricFilterErrors with filter',
                                    filter,
                                    e,
                                );
                                return acc;
                            }
                        }, []);

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

                    // Check for unused dimensions in chart configuration
                    // Only check dimensions that exist (skip those already flagged as "no longer exists")
                    const dimensionsWithErrors = new Set(
                        dimensionErrors.map((e) => e.fieldName),
                    );
                    const existingDimensions = dimensions.filter(
                        (d) => !dimensionsWithErrors.has(d),
                    );
                    const { unusedDimensions } = getUnusedDimensions({
                        chartType,
                        chartConfig,
                        pivotDimensions,
                        queryDimensions: existingDimensions,
                    });

                    const unusedDimensionErrors: CreateChartValidation[] =
                        unusedDimensions.map((dimension) => ({
                            ...commonValidation,
                            error: `dimension is not used in the chart configuration (x-axis, y-axis, or group by). This can cause incorrect rendering. We recommend removing unused fields.`,
                            errorType: ValidationErrorType.ChartConfiguration,
                            fieldName: dimension,
                        }));

                    // Check for unused table calculations in chart configuration
                    const { unusedTableCalculations } =
                        getUnusedTableCalculations({
                            chartType,
                            chartConfig,
                            queryTableCalculations: tableCalculations,
                        });

                    const unusedTableCalculationErrors: CreateChartValidation[] =
                        unusedTableCalculations.map((tc) => ({
                            ...commonValidation,
                            error: `table calculation is not used in the chart configuration (x-axis or y-axis). This can cause incorrect rendering. We recommend removing unused fields.`,
                            errorType: ValidationErrorType.ChartConfiguration,
                            fieldName: tc,
                        }));

                    return [
                        ...dimensionErrors,
                        ...metricErrors,
                        ...filterErrors,
                        ...sortErrors,
                        ...customMetricsErrors,
                        ...customMetricFilterErrors,
                        ...unusedDimensionErrors,
                        ...unusedTableCalculationErrors,
                    ];
                },
            );

        return results;
    }

    private async validateDashboards(
        projectUuid: string,
        existingFields: CompiledField[],
        brokenCharts: Pick<CreateChartValidation, 'chartUuid' | 'name'>[],
        dashboardUuid?: string,
    ): Promise<CreateDashboardValidation[]> {
        const existingFieldIds = existingFields.map(getItemId);

        // Pre-build Map for O(1) broken chart lookup instead of O(n) array.find()
        const brokenChartMap = new Map(
            brokenCharts.map((c) => [c.chartUuid, c]),
        );

        const dashboardsToValidate =
            await this.dashboardModel.findDashboardsForValidation(
                projectUuid,
                dashboardUuid,
            );
        const results: CreateDashboardValidation[] =
            dashboardsToValidate.flatMap(
                ({ name, dashboardUuid: uuid, filters, chartUuids }) => {
                    const commonValidation = {
                        name,
                        dashboardUuid: uuid,
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

                    const checkTableFieldConsistency = (
                        fieldId: string,
                        tableName: string | undefined,
                    ): CreateDashboardValidation | undefined => {
                        if (tableName && !fieldId.startsWith(`${tableName}_`)) {
                            return {
                                ...commonValidation,
                                errorType: ValidationErrorType.Filter,
                                error: `Filter error: the field '${fieldId}' does not match table '${tableName}'`,
                                fieldName: fieldId,
                            };
                        }
                        return undefined;
                    };

                    const dashboardFilterRules = [
                        ...filters.dimensions,
                        ...filters.metrics,
                    ];
                    const filterErrors = dashboardFilterRules.reduce<
                        CreateDashboardValidation[]
                    >((acc, filter) => {
                        try {
                            if (
                                isDashboardFieldTarget(filter.target) &&
                                filter.target.isSqlColumn
                            ) {
                                // Skip SQL column targets
                                return acc;
                            }
                            const { fieldId } = filter.target;
                            const tableName = isDashboardFieldTarget(
                                filter.target,
                            )
                                ? filter.target.tableName
                                : undefined;

                            const consistencyError = checkTableFieldConsistency(
                                fieldId,
                                tableName,
                            );
                            if (consistencyError) {
                                return [...acc, consistencyError];
                            }

                            return containsFieldId({
                                acc,
                                fieldIds: existingFieldIds,
                                fieldId: filter.target.fieldId,
                                error: `Filter error: the field '${filter.target.fieldId}' no longer exists`,
                                errorType: ValidationErrorType.Filter,
                                fieldName: filter.target.fieldId,
                            });
                        } catch (e) {
                            console.error(
                                'Unexpected validation error on dashboard filterErrors with filter',
                                filter,
                                e,
                            );
                            return acc;
                        }
                    }, []);

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
                            if (
                                tileTarget &&
                                isDashboardFieldTarget(tileTarget) &&
                                !tileTarget.isSqlColumn // Skip SQL column targets
                            ) {
                                const { fieldId, tableName } = tileTarget;

                                const consistencyError =
                                    checkTableFieldConsistency(
                                        fieldId,
                                        tableName,
                                    );
                                if (consistencyError) {
                                    return [...acc, consistencyError];
                                }

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
                        const brokenChart = brokenChartMap.get(savedChartUuid);
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
        validationTargets?: Set<ValidationTarget>,
        onlyValidateExploresInArgs?: boolean,
    ): Promise<CreateValidation[]> {
        const hasValidationTargets =
            validationTargets && validationTargets.size > 0;

        const invalidValidationTargets = hasValidationTargets
            ? Array.from(validationTargets).filter(
                  (target) => !isValidationTargetValid(target),
              )
            : [];

        if (hasValidationTargets && invalidValidationTargets?.length > 0) {
            throw new Error(
                `Invalid validation targets: ${invalidValidationTargets.join(
                    ', ',
                )}`,
            );
        }

        const targetsString = hasValidationTargets
            ? `${Array.from(validationTargets).join(', ')}`
            : 'every target';

        this.logger.debug(
            `Generating validation of ${targetsString} for project ${projectUuid} with explores ${
                compiledExplores ? 'from CLI' : 'from cache'
            }`,
        );

        let explores: (Explore | ExploreError)[];
        if (compiledExplores !== undefined) {
            // For CLI validation, when compiled Explores are provided, merge them with virtual views from cache
            const virtualViews =
                await this.projectModel.findVirtualViewsFromCache(projectUuid);

            explores = compiledExplores.concat(Object.values(virtualViews));
            this.logger.debug(
                `Merged ${compiledExplores.length} compiled explores with ${
                    Object.values(virtualViews).length
                } virtual views for validation`,
            );
        } else {
            explores = Object.values(
                await this.projectModel.findExploresFromCache(
                    projectUuid,
                    'name',
                ),
            );
        }
        // Check for undefined dimensions/metrics before processing
        explores?.forEach((explore) => {
            if (!isExploreError(explore) && explore?.tables !== undefined) {
                const dimensions = Object.values(explore.tables).flatMap(
                    (table) => Object.values(table.dimensions),
                );
                const metrics = Object.values(explore.tables).flatMap((table) =>
                    Object.values(table.metrics),
                );

                if (dimensions.find((d) => d === undefined)) {
                    Sentry.captureException(
                        new UnexpectedServerError(
                            `Undefined dimension found in explore ${explore.name} in project ${projectUuid}`,
                        ),
                    );
                }
                if (metrics.find((m) => m === undefined)) {
                    Sentry.captureException(
                        new UnexpectedServerError(
                            `Undefined metric found in explore ${explore.name} in project ${projectUuid}`,
                        ),
                    );
                }
            }
        });

        const exploreFields = explores
            ? ValidationService.buildExploreFields(explores)
            : {};

        const existingFields = explores
            ? ValidationService.buildExistingFields(explores)
            : [];

        if (!existingFields) {
            this.logger.warn(
                `No fields found for project validation ${projectUuid}`,
            );
            return [];
        }

        const tableErrors =
            !hasValidationTargets ||
            validationTargets.has(ValidationTarget.TABLES)
                ? await this.validateTables(projectUuid, explores)
                : [];

        const chartErrors =
            !hasValidationTargets ||
            validationTargets.has(ValidationTarget.CHARTS) ||
            validationTargets.has(ValidationTarget.DASHBOARDS) // chartErrors are reused for dashboard validation
                ? await this.validateCharts(
                      projectUuid,
                      exploreFields,
                      onlyValidateExploresInArgs ? compiledExplores : undefined,
                  )
                : [];

        // Only treat blocking chart errors as dashboard-breaking; warnings like
        // chart configuration issues should not surface as dashboard errors.
        const blockingChartErrors = chartErrors.filter(
            (error) =>
                error.errorType !== ValidationErrorType.ChartConfiguration,
        );

        const dashboardErrors =
            !hasValidationTargets ||
            validationTargets.has(ValidationTarget.DASHBOARDS)
                ? await this.validateDashboards(
                      projectUuid,
                      existingFields,
                      blockingChartErrors,
                  )
                : [];

        return [...tableErrors, ...chartErrors, ...dashboardErrors];
    }

    async validate(
        user: SessionUser,
        projectUuid: string,
        context?: RequestMethod,
        explores?: (Explore | ExploreError)[],
        validationTargets?: ValidationTarget[],
        onlyValidateExploresInArgs?: boolean,
    ): Promise<string> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid,
                    projectUuid,
                    uuid: projectUuid,
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
            organizationUuid,
            explores,
            validationTargets,
            onlyValidateExploresInArgs,
        });
        return jobId;
    }

    async storeValidation(
        projectUuid: string,
        validationErrors: CreateValidation[],
        jobId?: string,
    ) {
        // If not storing for an specific CLI validation, replace previous validations
        if (jobId === undefined) {
            await this.validationModel.replaceProjectValidations(
                projectUuid,
                validationErrors,
            );
        } else if (validationErrors.length > 0) {
            await this.validationModel.create({
                projectUuid,
                validations: validationErrors,
                jobId,
            });
        }
    }

    async hidePrivateContent(
        user: SessionUser,
        projectUuid: string,
        validations: ValidationResponse[],
    ): Promise<ValidationResponse[]> {
        if (user.role === OrganizationMemberRole.ADMIN) return validations;

        const spaces = await this.spaceModel.find({ projectUuid });
        const spaceUuids = spaces.map((s) => s.uuid);

        const allowedSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaceUuids,
            );

        // Filter private content to developers
        return Promise.all(
            validations.map(async (validation) => {
                // Table validations are project-level, not space-specific
                // Anyone with project access can see them
                if (
                    !isDashboardValidationError(validation) &&
                    !isChartValidationError(validation) &&
                    isTableValidationError(validation)
                ) {
                    return validation;
                }

                const isDeleted =
                    (isDashboardValidationError(validation) &&
                        !validation.dashboardUuid) ||
                    (isChartValidationError(validation) &&
                        !validation.chartUuid);

                if (isDeleted) {
                    return {
                        ...validation,
                        chartUuid: undefined,
                        dashboardUuid: undefined,
                        name: 'Deleted content',
                    };
                }

                const space = spaces.find(
                    (s) => s.uuid === validation.spaceUuid,
                );
                const hasAccess =
                    space && allowedSpaceUuids.includes(space.uuid);
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
                    uuid: projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const allValidations = await this.validationModel.get(
            projectUuid,
            jobId,
        );

        // Filter out orphaned validations (content was deleted)
        const validations = allValidations.filter((validation) => {
            // Keep table validations (they don't reference charts/dashboards)
            if (
                !isDashboardValidationError(validation) &&
                !isChartValidationError(validation)
            ) {
                return true;
            }

            // Filter out chart/dashboard validations where content no longer exists
            const hasChartUuid =
                isChartValidationError(validation) && validation.chartUuid;
            const hasDashboardUuid =
                isDashboardValidationError(validation) &&
                validation.dashboardUuid;

            return hasChartUuid || hasDashboardUuid;
        });

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

    async getById(
        user: SessionUser,
        projectUuid: string,
        validationId: number,
    ): Promise<ValidationResponse> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);

        const auditedAbility = new CaslAuditWrapper(user.ability, user, {
            auditLogger: logAuditEvent,
        });

        if (
            auditedAbility.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                    uuid: projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        let allowedSpaceUuids: string[] | 'all' = 'all';

        if (user.role !== OrganizationMemberRole.ADMIN) {
            const spaces = await this.spaceModel.find({ projectUuid });
            const spaceUuids = spaces.map((s) => s.uuid);

            allowedSpaceUuids =
                await this.spacePermissionService.getAccessibleSpaceUuids(
                    'view',
                    user,
                    spaceUuids,
                );
        }

        const validation = await this.validationModel.getFullById(
            validationId,
            { allowedSpaceUuids },
        );

        if (!validation) {
            throw new NotFoundError(
                `Validation with id ${validationId} not found`,
            );
        }

        return validation;
    }

    async getPaginated(
        user: SessionUser,
        projectUuid: string,
        paginateArgs: KnexPaginateArgs,
        options?: {
            searchQuery?: string;
            sortBy?: 'name' | 'createdAt' | 'errorType' | 'source';
            sortDirection?: 'asc' | 'desc';
            sourceTypes?: ValidationSourceType[];
            errorTypes?: ValidationErrorType[];
            includeChartConfigWarnings?: boolean;
            fromSettings?: boolean;
            jobId?: string;
        },
    ): Promise<KnexPaginatedData<ValidationResponse[]>> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);

        const auditedAbility = new CaslAuditWrapper(user.ability, user, {
            auditLogger: logAuditEvent,
        });

        if (
            auditedAbility.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                    uuid: projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        let allowedSpaceUuids: string[] | 'all' = 'all';

        if (user.role !== OrganizationMemberRole.ADMIN) {
            const spaces = await this.spaceModel.find({ projectUuid });
            const spaceUuids = spaces.map((s) => s.uuid);

            allowedSpaceUuids =
                await this.spacePermissionService.getAccessibleSpaceUuids(
                    'view',
                    user,
                    spaceUuids,
                );
        }

        const result = await this.validationModel.getPaginated(
            projectUuid,
            paginateArgs,
            {
                searchQuery: options?.searchQuery,
                sortBy: options?.sortBy,
                sortDirection: options?.sortDirection,
                sourceTypes: options?.sourceTypes,
                errorTypes: options?.errorTypes,
                includeChartConfigWarnings: options?.includeChartConfigWarnings,
                allowedSpaceUuids,
                jobId: options?.jobId,
            },
        );

        if (options?.fromSettings) {
            const contentIds = result.data.map(
                (validation) =>
                    ('chartUuid' in validation && validation.chartUuid) ||
                    ('dashboardUuid' in validation &&
                        validation.dashboardUuid) ||
                    validation.name,
            );

            this.analytics.track({
                event: 'validation.page_viewed',
                userId: user.userUuid,
                properties: {
                    organizationId: projectSummary.organizationUuid,
                    projectId: projectUuid,
                    numErrorsDetected:
                        result.pagination?.totalResults ?? result.data.length,
                    numContentAffected: new Set(contentIds).size,
                },
            });
        }

        return result;
    }

    async getJob(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ValidationResponse[]> {
        const validations = await this.validationModel.get(projectUuid);
        return this.hidePrivateContent(user, projectUuid, validations);
    }

    async delete(user: SessionUser, validationId: number): Promise<void> {
        const validation =
            await this.validationModel.getByValidationId(validationId);
        const projectSummary = await this.projectModel.getSummary(
            validation.projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid: projectSummary.organizationUuid,
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

    async validateAndUpdateChart(
        user: SessionUser,
        projectUuid: string,
        chartUuid: string,
    ): Promise<CreateChartValidation[]> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid,
                    projectUuid,
                    uuid: projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Get the chart to find which explore it uses
        const chart = await this.savedChartModel.get(chartUuid);

        // Check user permissions
        const { isPrivate, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                chart.spaceUuid,
            );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid: chart.organizationUuid,
                    projectUuid: chart.projectUuid,
                    isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to validate this chart",
            );
        }

        // Only fetch the specific explore this chart uses
        const compiledExplore = await this.projectModel.getExploreFromCache(
            projectUuid,
            chart.tableName,
        );
        const compiledExplores = compiledExplore ? [compiledExplore] : [];

        // Build field lookup for validation
        const exploreFields =
            ValidationService.buildExploreFields(compiledExplores);

        // Validate the single chart
        const validationErrors = await this.validateCharts(
            projectUuid,
            exploreFields,
            compiledExplores,
            chartUuid,
        );

        // Delete existing validations for this chart
        await this.validationModel.deleteChartValidations(chartUuid);

        // Store new validation errors if any
        if (validationErrors.length > 0) {
            await this.validationModel.create({
                projectUuid,
                validations: validationErrors,
            });
        }

        return validationErrors;
    }

    async validateAndUpdateDashboard(
        user: SessionUser,
        projectUuid: string,
        dashboardUuid: string,
    ): Promise<CreateDashboardValidation[]> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid,
                    projectUuid,
                    uuid: projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Get the dashboard to check permissions
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);

        // Check user permissions
        const { isPrivate, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                dashboard.spaceUuid,
            );

        if (
            user.ability.cannot(
                'view',
                subject('Dashboard', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                    isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to validate this dashboard",
            );
        }

        // Get all explores for dashboard validation
        const compiledExploresMap =
            await this.projectModel.getAllExploresFromCache(projectUuid);
        const compiledExplores = Object.values(compiledExploresMap);

        // Get existing fields for validation
        const existingFields =
            ValidationService.buildExistingFields(compiledExplores);

        // Get existing chart validation errors from database
        const validations = await this.validationModel.get(projectUuid);
        const blockingChartErrors = validations.reduce<
            Array<{ chartUuid: string; name: string }>
        >((acc, v) => {
            if (
                v.source === ValidationSourceType.Chart &&
                'chartUuid' in v &&
                v.chartUuid &&
                v.errorType !== ValidationErrorType.ChartConfiguration
            ) {
                acc.push({
                    chartUuid: v.chartUuid,
                    name: v.name || '',
                });
            }
            return acc;
        }, []);

        // Validate the single dashboard
        const validationErrors = await this.validateDashboards(
            projectUuid,
            existingFields,
            blockingChartErrors,
            dashboardUuid,
        );

        // Delete existing validations for this dashboard
        await this.validationModel.deleteDashboardValidations(dashboardUuid);

        // Store new validation errors if any
        if (validationErrors.length > 0) {
            await this.validationModel.create({
                projectUuid,
                validations: validationErrors,
            });
        }

        return validationErrors;
    }
}
