import { Ability } from '@casl/ability';
import {
    AbilityAction,
    AnyType,
    FilterOperator,
    ForbiddenError,
    OrganizationMemberRole,
    TableCalculationTemplateType,
    TableSelectionType,
    ValidationErrorType,
    ValidationSourceType,
    ValidationTarget,
    WindowFunctionType,
} from '@lightdash/common';
import { validateWarehouseColumnReferences } from '@lightdash/warehouses';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { AppModel } from '../../models/AppModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { ValidationModel } from '../../models/ValidationModel/ValidationModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { ValidationService } from './ValidationService';
import {
    additionalExplore,
    chartForValidation,
    chartForValidationWithAdditionalExplore,
    chartForValidationWithCustomMetricFilters,
    chartForValidationWithJoinedField,
    config,
    dashboardForValidation,
    explore,
    exploreError,
    exploreWithJoin,
    exploreWithMixedWarnings,
    exploreWithNonWarehouseWarnings,
    exploreWithoutDimension,
    exploreWithoutMetric,
    exploreWithWarehouseColumnError,
    project,
    tableConfiguration,
    user,
} from './ValidationService.mock';

vi.mock('@lightdash/warehouses', async (importOriginal) => {
    const original =
        await importOriginal<typeof import('@lightdash/warehouses')>();
    return {
        ...original,
        validateWarehouseColumnReferences: vi.fn(),
    };
});

const savedChartModel = {
    findChartsForValidation: vi.fn(async () => [chartForValidation]),
    get: vi.fn(async () => ({
        ...chartForValidation,
        spaceUuid: 'spaceUuid',
        organizationUuid: 'orgUuid',
        projectUuid: 'projectUuid',
    })),
};
const projectModel = {
    findExploresFromCache: vi.fn(async () => ({
        [explore.name]: explore,
    })),
    findVirtualViewsFromCache: vi.fn(async () => ({})),
    getExploreFromCache: vi.fn(async () => explore),
    getAllExploresFromCache: vi.fn(async () => ({
        [explore.name]: explore,
    })),
    get: vi.fn(async () => project),
    getSummary: vi.fn(async () => project),
    getTablesConfiguration: vi.fn(async () => tableConfiguration),
};
const validationModel = {
    delete: vi.fn(async () => {}),
    deleteChartValidations: vi.fn(async () => {}),
    deleteDashboardValidations: vi.fn(async () => {}),
    create: vi.fn(async () => {}),
    get: vi.fn(async () => []),
};
const appModel = {
    findAppsForValidation: vi.fn(
        async (): ReturnType<AppModel['findAppsForValidation']> => [],
    ),
    listAppsByProject: vi.fn(async (): Promise<AnyType[]> => []),
};
const dashboardModel = {
    findDashboardsForValidation: vi.fn(async () => [dashboardForValidation]),
    getByIdOrSlug: vi.fn(async () => ({
        ...dashboardForValidation,
        uuid: dashboardForValidation.dashboardUuid,
        spaceUuid: 'spaceUuid',
        organizationUuid: 'orgUuid',
        projectUuid: 'projectUuid',
    })),
};
const spaceModel = {
    find: vi.fn(async () => []),
};
const spacePermissionService = {
    getSpaceAccessContext: vi.fn(async () => ({
        inheritsFromOrgOrProject: false,
        access: [],
    })),
    getSpacesAccessContext: vi.fn(async () => ({})),
    getAccessibleSpaceUuids: vi.fn(async () => []),
};
describe('validation', () => {
    const validationService = new ValidationService({
        analytics: analyticsMock,
        validationModel: validationModel as unknown as ValidationModel,
        projectModel: projectModel as unknown as ProjectModel,
        appModel: appModel as unknown as AppModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        lightdashConfig: config,
        spaceModel: spaceModel as unknown as SpaceModel,
        schedulerClient: {} as SchedulerClient,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        featureFlagModel: {} as FeatureFlagModel,
    });
    const allAccessUser = {
        ...user,
        ability: new Ability<[AbilityAction, AnyType]>([
            { subject: 'Validation', action: ['manage'] },
            { subject: 'SavedChart', action: ['view'] },
            { subject: 'Dashboard', action: ['view'] },
        ]),
    };

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('scopes single chart validation lookups and cleanup to the requested project', async () => {
        await validationService.validateAndUpdateChart(
            allAccessUser,
            'projectUuid',
            'chartUuid',
        );

        expect(savedChartModel.get).toHaveBeenCalledWith(
            'chartUuid',
            undefined,
            { projectUuid: 'projectUuid' },
        );
        expect(validationModel.deleteChartValidations).toHaveBeenCalledWith(
            'chartUuid',
            'projectUuid',
        );
    });

    it('scopes single dashboard validation lookups and cleanup to the requested project', async () => {
        await validationService.validateAndUpdateDashboard(
            allAccessUser,
            'projectUuid',
            'dashboardUuid',
        );

        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
            'dashboardUuid',
            { projectUuid: 'projectUuid' },
        );
        expect(validationModel.deleteDashboardValidations).toHaveBeenCalledWith(
            'dashboardUuid',
            'projectUuid',
        );
    });

    it('Should validate project without errors', async () => {
        expect(
            await validationService.generateValidation('projectUuid'),
        ).toEqual([]);
    });
    it('Should validate project with dimension errors', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [exploreWithoutDimension]);

        const errors =
            await validationService.generateValidation('projectUuid');

        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            error: "Dimension error: the field 'table_dimension' no longer exists",
            errorType: 'dimension',
            fieldName: 'table_dimension',
            tableName: 'table',
            name: 'Test chart',
            projectUuid: 'projectUuid',
            chartUuid: 'chartUuid',
            source: 'chart',
            chartName: 'Test chart',
        });

        const expectedErrors: string[] = [
            "Dimension error: the field 'table_dimension' no longer exists",
            "Filter error: the field 'table_dimension' no longer exists",
            "Sorting error: the field 'table_dimension' no longer exists",
            "Custom metric error: the base dimension 'table_dimension' no longer exists",
            "Custom metric filter error: the field 'table_dimension' no longer exists",
            "The chart 'Test chart' is broken on this dashboard.",
        ];
        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
    });

    it('Should validate project with metric errors', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [exploreWithoutMetric]);

        const errors =
            await validationService.generateValidation('projectUuid');

        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            error: "Metric error: the field 'table_metric' no longer exists",
            errorType: 'metric',
            fieldName: 'table_metric',
            tableName: 'table',
            name: 'Test chart',
            projectUuid: 'projectUuid',
            chartUuid: 'chartUuid',
            source: 'chart',
            chartName: 'Test chart',
        });

        const expectedErrors: string[] = [
            "Metric error: the field 'table_metric' no longer exists",
            "Filter error: the field 'table_metric' no longer exists",
            "The chart 'Test chart' is broken on this dashboard.",
        ];
        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
    });

    it('Should collapse chart field errors into a single model error when the explore was deleted', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => []);

        const errors =
            await validationService.generateValidation('projectUuid');
        const chartErrors = errors.filter(
            (e) => e.source === ValidationSourceType.Chart,
        );

        expect(chartErrors).toHaveLength(1);
        expect({ ...chartErrors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            error: "Model error: the model 'table' no longer exists",
            errorType: ValidationErrorType.Model,
            tableName: 'table',
            name: 'Test chart',
            projectUuid: 'projectUuid',
            chartUuid: 'chartUuid',
            source: ValidationSourceType.Chart,
            chartName: 'Test chart',
        });

        // The model error is blocking, so dashboards still flag the broken chart
        expect(
            errors
                .filter((e) => e.source === ValidationSourceType.Dashboard)
                .map((e) => e.error),
        ).toContain("The chart 'Test chart' is broken on this dashboard.");
    });

    it('Should report a compile failure when the chart explore failed to compile', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [exploreError]);

        const errors =
            await validationService.generateValidation('projectUuid');
        const chartErrors = errors.filter(
            (e) => e.source === ValidationSourceType.Chart,
        );

        expect(chartErrors).toHaveLength(1);
        expect(chartErrors[0]).toMatchObject({
            error: "Model error: the model 'table' failed to compile",
            errorType: ValidationErrorType.Model,
            tableName: 'table',
        });
    });

    it('Should create table validation errors from CLI warehouse diagnostics without probing the warehouse', async () => {
        const errors = await validationService.generateValidation(
            'projectUuid',
            [exploreWithWarehouseColumnError],
        );

        expect(errors).toHaveLength(1);
        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            name: 'valid_explore',
            error: 'Warehouse rejected ${TABLE}.missing_column',
            errorType: ValidationErrorType.Model,
            modelName: 'valid_explore',
            projectUuid: 'projectUuid',
            source: ValidationSourceType.Table,
        });
        expect(validateWarehouseColumnReferences).not.toHaveBeenCalled();
    });

    it('Should ignore cached explore warnings unrelated to warehouse columns', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [exploreWithNonWarehouseWarnings]);

        const errors =
            await validationService.generateValidation('projectUuid');

        expect(errors).toEqual([]);
    });

    it('Should create only the warehouse table error from mixed CLI diagnostics', async () => {
        const errors = await validationService.generateValidation(
            'projectUuid',
            [exploreWithMixedWarnings],
        );

        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({
            error: 'Warehouse rejected ${TABLE}.missing_column',
            errorType: ValidationErrorType.Model,
            source: ValidationSourceType.Table,
        });
    });

    it('Should validate project with table errors', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [exploreError]);

        const errors =
            await validationService.generateValidation('projectUuid');

        const tableErrors = errors.filter((ve) => ve.source === 'table');

        expect({ ...tableErrors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            name: 'valid_explore',
            modelName: 'valid_explore',
            error: 'Model "valid_explore" in metric "some_metric" has a dimension reference: ${is_completed} which matches no dimension',
            errorType: 'model',
            projectUuid: 'projectUuid',
            source: 'table',
        });

        expect(errors[0]!.error).toEqual(
            'Model "valid_explore" in metric "some_metric" has a dimension reference: ${is_completed} which matches no dimension',
        );
    });

    it('Should not show unselected table errors', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [exploreError]);

        (
            projectModel.getTablesConfiguration as import('vitest').Mock
        ).mockImplementationOnce(async () => ({
            tableSelection: {
                type: TableSelectionType.WITH_NAMES,
                value: ['another_explore'],
            },
        }));
        const errors =
            await validationService.generateValidation('projectUuid');
        const tableErrors = errors.filter((ve) => ve.source === 'table');

        expect(tableErrors.length).toEqual(0);
    });

    it('Should show unselected table errors on joins', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => ({
            valid_explore: exploreError,
            joined_explore: {
                name: 'joined_explore',
                joinedTables: [{ table: 'valid_explore' }],
                tables: {}, // Add tables property to avoid undefined error
            },
        }));

        (
            projectModel.getTablesConfiguration as import('vitest').Mock
        ).mockImplementationOnce(async () => ({
            tableSelection: {
                type: TableSelectionType.WITH_NAMES,
                value: ['joined_explore'],
            },
        }));
        const errors =
            await validationService.generateValidation('projectUuid');
        const tableErrors = errors.filter((ve) => ve.source === 'table');

        expect(tableErrors.length).toEqual(1);

        expect({ ...tableErrors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            name: 'valid_explore',
            modelName: 'valid_explore',
            error: 'Model "valid_explore" in metric "some_metric" has a dimension reference: ${is_completed} which matches no dimension',
            errorType: 'model',
            projectUuid: 'projectUuid',
            source: 'table',
        });

        expect(errors[0]!.error).toEqual(
            'Model "valid_explore" in metric "some_metric" has a dimension reference: ${is_completed} which matches no dimension',
        );
    });

    it('Should validate only tables in project', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => ({
            valid_explore: exploreError,
            explore_without_dimension: exploreWithoutDimension,
        }));

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.TABLES]),
        );

        const expectedErrors: string[] = [
            'Model "valid_explore" in metric "some_metric" has a dimension reference: ${is_completed} which matches no dimension',
        ];

        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
    });

    it('validates definite data app reference errors and ignores unavailable extraction data', async () => {
        appModel.findAppsForValidation.mockResolvedValueOnce([
            {
                app_id: 'broken-app-uuid',
                name: 'Broken app',
                data_references: {
                    references: [
                        {
                            kind: 'query',
                            explore: 'missing_explore',
                            dimensions: [],
                            metrics: [],
                            dimensionFilterFields: [],
                            metricFilterFields: [],
                            sortFields: [],
                            parameterKeys: [],
                            localFields: [],
                            unresolved: [],
                            location: {
                                path: 'src/App.tsx',
                                line: 10,
                                column: 5,
                            },
                        },
                        {
                            kind: 'query',
                            explore: 'unavailable_explore',
                            dimensions: [],
                            metrics: [],
                            dimensionFilterFields: [],
                            metricFilterFields: [],
                            sortFields: [],
                            parameterKeys: [],
                            localFields: [],
                            unresolved: [],
                            location: {
                                path: 'src/App.tsx',
                                line: 20,
                                column: 5,
                            },
                        },
                    ],
                    parseErrors: [],
                    stats: {
                        callSites: 2,
                        fullyResolved: 2,
                        partiallyResolved: 0,
                        unresolved: 0,
                    },
                },
            },
            {
                app_id: 'legacy-app-uuid',
                name: 'Legacy app',
                data_references: null,
            },
            {
                app_id: 'parse-warning-app-uuid',
                name: 'Parse warning app',
                data_references: {
                    references: [],
                    parseErrors: [
                        {
                            path: 'src/App.tsx',
                            message: 'Could not parse source',
                        },
                    ],
                    stats: {
                        callSites: 0,
                        fullyResolved: 0,
                        partiallyResolved: 0,
                        unresolved: 0,
                    },
                },
            },
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            [
                explore,
                {
                    ...exploreError,
                    name: 'unavailable_explore',
                },
            ],
            new Set([ValidationTarget.APPS]),
        );

        expect(errors).toEqual([
            expect.objectContaining({
                appUuid: 'broken-app-uuid',
                name: 'Broken app',
                source: ValidationSourceType.DataApp,
                errorType: ValidationErrorType.Model,
                error: "Explore 'missing_explore' does not exist",
                modelName: 'missing_explore',
            }),
        ]);
    });

    it('reveals only owned personal data app validations to non-admins', async () => {
        appModel.listAppsByProject.mockResolvedValueOnce([
            {
                app_id: 'owned-app-uuid',
                space_uuid: null,
                created_by_user_uuid: user.userUuid,
            },
            {
                app_id: 'private-app-uuid',
                space_uuid: null,
                created_by_user_uuid: 'another-user-uuid',
            },
        ]);
        const nonAdminUser = {
            ...user,
            role: OrganizationMemberRole.DEVELOPER,
            ability: new Ability<[AbilityAction, AnyType]>([
                {
                    subject: 'DataApp',
                    action: ['view'],
                    conditions: {
                        projectUuid: 'projectUuid',
                        createdByUserUuid: user.userUuid,
                    },
                },
            ]),
        };
        const validationBase = {
            validationId: null,
            createdAt: new Date(),
            projectUuid: 'projectUuid',
            error: "Explore 'missing_explore' does not exist",
            errorType: ValidationErrorType.Model,
            source: ValidationSourceType.DataApp,
        } as const;

        const result = await validationService.hidePrivateContent(
            nonAdminUser,
            'projectUuid',
            [
                {
                    ...validationBase,
                    validationUuid: 'owned-validation-uuid',
                    appUuid: 'owned-app-uuid',
                    name: 'Owned app',
                },
                {
                    ...validationBase,
                    validationUuid: 'private-validation-uuid',
                    appUuid: 'private-app-uuid',
                    name: 'Private app',
                },
            ],
        );

        expect(result).toEqual([
            expect.objectContaining({
                appUuid: 'owned-app-uuid',
                name: 'Owned app',
            }),
            expect.objectContaining({
                appUuid: undefined,
                name: 'Private content',
            }),
        ]);
    });

    it('does not validate data apps against an explore-scoped compilation', async () => {
        const errors = await validationService.generateValidation(
            'projectUuid',
            [explore],
            new Set([ValidationTarget.APPS]),
            true,
        );

        expect(errors).toEqual([]);
        expect(appModel.findAppsForValidation).not.toHaveBeenCalled();
    });

    it('includes data apps in default project validation runs', async () => {
        await validationService.generateValidation('projectUuid', [explore]);

        expect(appModel.findAppsForValidation).toHaveBeenCalledWith(
            'projectUuid',
        );
    });

    it('Should validate only charts in project', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            exploreError,
            exploreWithoutDimension,
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.CHARTS]),
        );

        const expectedErrors: string[] = [
            "Dimension error: the field 'table_dimension' no longer exists",
            "Filter error: the field 'table_dimension' no longer exists",
            "Sorting error: the field 'table_dimension' no longer exists",
            "Custom metric error: the base dimension 'table_dimension' no longer exists",
            "Custom metric filter error: the field 'table_dimension' no longer exists",
        ];

        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
    });

    it('Should validate only dashboards in project', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [exploreWithoutDimension]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.DASHBOARDS]),
        );

        const expectedErrors: string[] = [
            "Dimension error: the field 'table_dimension' no longer exists",
            "Filter error: the field 'table_dimension' no longer exists",
            "Sorting error: the field 'table_dimension' no longer exists",
            "Custom metric error: the base dimension 'table_dimension' no longer exists",
            "Custom metric filter error: the field 'table_dimension' no longer exists",
            "The chart 'Test chart' is broken on this dashboard.",
        ];

        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
    });

    it('Should validate dashboard filters with table name mismatch', async () => {
        (
            dashboardModel.findDashboardsForValidation as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            {
                ...dashboardForValidation,
                filters: {
                    dimensions: [
                        {
                            id: 'filter-uuid',
                            target: {
                                fieldId: 'other_table_field',
                                tableName: 'table',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.DASHBOARDS]),
        );

        expect(errors.map((error) => error.error)).toContain(
            "Filter error: the field 'other_table_field' does not match table 'table'",
        );
    });

    it('Should flag dashboard filter referencing a deleted explore as TableDoesNotExist', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [explore]);
        (
            dashboardModel.findDashboardsForValidation as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            {
                ...dashboardForValidation,
                filters: {
                    dimensions: [
                        {
                            id: 'filter-uuid',
                            target: {
                                fieldId: 'deleted_model_status',
                                tableName: 'deleted_model',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.DASHBOARDS]),
        );

        // Must match the exact wording parsed by
        // ValidationModel.parseDashboardFilterError so the bell-icon UI
        // categorises this as TableDoesNotExist (and offers a rename/delete).
        expect(errors.map((error) => error.error)).toContain(
            "Table 'deleted_model' no longer exists",
        );
        // The generic "field no longer exists" should NOT also appear for
        // this target — we want a single, specific error.
        expect(errors.map((error) => error.error)).not.toContain(
            "Filter error: the field 'deleted_model_status' on table 'deleted_model' no longer exists",
        );
    });

    it('Should flag dashboard tile target referencing a deleted explore as TableDoesNotExist', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [explore]);
        (
            dashboardModel.findDashboardsForValidation as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            {
                ...dashboardForValidation,
                filters: {
                    dimensions: [
                        {
                            id: 'filter-uuid',
                            target: {
                                fieldId: 'table_dimension',
                                tableName: 'table',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [],
                            tileTargets: {
                                'tile-uuid': {
                                    fieldId: 'deleted_model_status',
                                    tableName: 'deleted_model',
                                },
                            },
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.DASHBOARDS]),
        );

        expect(errors.map((error) => error.error)).toContain(
            "Table 'deleted_model' no longer exists",
        );
    });

    it('Should NOT flag dashboard filter on a valid joined table', async () => {
        // exploreWithJoin contains both `table` and `another_table` in its
        // .tables map — a filter on `table_dimension` via `tableName: 'table'`
        // must stay error-free even though `table` is not the baseTable.
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [exploreWithJoin]);
        (
            dashboardModel.findDashboardsForValidation as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            {
                ...dashboardForValidation,
                filters: {
                    dimensions: [
                        {
                            id: 'filter-uuid',
                            target: {
                                fieldId: 'table_dimension',
                                tableName: 'table',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.DASHBOARDS]),
        );

        expect(
            errors.filter((e) =>
                e.error?.startsWith("Table 'table' no longer exists"),
            ),
        ).toEqual([]);
    });

    it('Should still emit FieldDoesNotExist when the table is valid but the field is renamed', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [explore]);
        (
            dashboardModel.findDashboardsForValidation as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            {
                ...dashboardForValidation,
                filters: {
                    dimensions: [
                        {
                            id: 'filter-uuid',
                            target: {
                                fieldId: 'table_renamed_field',
                                tableName: 'table',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.DASHBOARDS]),
        );

        expect(errors.map((error) => error.error)).toContain(
            "Filter error: the field 'table_renamed_field' on table 'table' no longer exists",
        );
        expect(errors.map((error) => error.error)).not.toContain(
            "Table 'table' no longer exists",
        );
    });

    it('Should validate dashboard tile targets with table name mismatch', async () => {
        (
            dashboardModel.findDashboardsForValidation as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            {
                ...dashboardForValidation,
                filters: {
                    dimensions: [
                        {
                            id: 'filter-uuid',
                            target: {
                                fieldId: 'table_field',
                                tableName: 'table',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [],
                            tileTargets: {
                                'tile-uuid': {
                                    fieldId: 'other_table_field',
                                    tableName: 'table',
                                },
                            },
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.DASHBOARDS]),
        );

        expect(errors.map((error) => error.error)).toContain(
            "Filter error: the field 'other_table_field' does not match table 'table'",
        );
    });

    it('Should validate only tables and charts in project', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            exploreError,
            exploreWithoutDimension,
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.TABLES, ValidationTarget.CHARTS]),
        );

        const expectedErrors: string[] = [
            'Model "valid_explore" in metric "some_metric" has a dimension reference: ${is_completed} which matches no dimension',
            "Dimension error: the field 'table_dimension' no longer exists",
            "Filter error: the field 'table_dimension' no longer exists",
            "Sorting error: the field 'table_dimension' no longer exists",
            "Custom metric error: the base dimension 'table_dimension' no longer exists",
            "Custom metric filter error: the field 'table_dimension' no longer exists",
        ];

        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
    });

    it('Should validate fields from joined explores', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [explore, exploreWithJoin]);
        (
            savedChartModel.findChartsForValidation as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            chartForValidationWithJoinedField,
        ]);

        const errors =
            await validationService.generateValidation('projectUuid');

        expect(errors.length).toEqual(0);
    });

    it('Should validate custom metric filters', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [explore, exploreWithJoin]);

        (
            savedChartModel.findChartsForValidation as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            chartForValidationWithCustomMetricFilters,
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.CHARTS]),
        );

        expect(errors.length).toEqual(0);
    });

    it('Should validate charts using additional explores', async () => {
        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [explore, additionalExplore]);

        (
            savedChartModel.findChartsForValidation as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            chartForValidationWithAdditionalExplore,
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.CHARTS]),
        );

        // Chart uses "additional_explore" as tableName but has same fields as base "table"
        // Should validate without errors because fields are indexed by both baseTable and explore name
        expect(errors.length).toEqual(0);
    });

    it('Should not let derived explores overwrite base table validation fields', async () => {
        const preAggregateLikeExplore = {
            ...explore,
            name: '__preagg__table__daily',
            tables: {
                table: {
                    ...explore.tables.table!,
                    dimensions: {},
                    metrics: {},
                },
            },
        };

        (
            projectModel.findExploresFromCache as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            explore,
            preAggregateLikeExplore,
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.CHARTS]),
        );

        expect(errors.length).toEqual(0);
    });
});

describe('ValidationService - Table Calculation Templates', () => {
    it('Should extract field references from table calculation templates', () => {
        const result = ValidationService.getTableCalculationFieldIds([
            {
                name: 'template_calc_with_sql',
                displayName: 'Template Calc with SQL',
                sql: '${table.dimension} + 1',
            },
            {
                name: 'template_calc_with_sql',
                displayName: 'Template Calc with SQL',
                sql: '',
                template: {
                    type: TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
                    fieldId: 'table_metric2',
                    orderBy: [
                        { fieldId: 'table_dimension2', order: 'asc' },
                        { fieldId: 'table_metric3', order: 'desc' },
                    ],
                },
            },
            {
                name: 'template_calc_only',
                displayName: 'Template Calc Only',
                sql: '',
                template: {
                    type: TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
                    fieldId: 'nonexistent_field',
                    orderBy: [
                        { fieldId: 'another_nonexistent_field', order: 'asc' },
                    ],
                },
            },
        ]);

        // Verify that the method extracts field references from both SQL and templates
        // The method processes each table calculation independently:
        // - First calc has SQL, so it extracts from SQL only
        // - Second calc has no SQL, so it extracts from template
        expect(result).toEqual([
            'table_dimension', // from first calc's SQL
            'table_metric2', // from second calc's template fieldId
            'table_dimension2', // from second calc's template orderBy
            'table_metric3', // from second calc's template orderBy
            'nonexistent_field', // from second calc's template fieldId
            'another_nonexistent_field', // from second calc's template orderBy
        ]);
    });

    it('Should handle table calculations with only SQL', () => {
        const result = ValidationService.getTableCalculationFieldIds([
            {
                name: 'sql_only_calc',
                displayName: 'SQL Only Calc',
                sql: '${table.field1} + ${table.field2}',
            },
        ]);

        expect(result).toEqual(['table_field1', 'table_field2']);
    });

    it('Should handle table calculations with only templates', () => {
        const result = ValidationService.getTableCalculationFieldIds([
            {
                name: 'template_only_calc',
                displayName: 'Template Only Calc',
                sql: '',
                template: {
                    type: TableCalculationTemplateType.RANK_IN_COLUMN,
                    fieldId: 'table_metric',
                },
            },
        ]);

        expect(result).toEqual(['table_metric']);
    });

    it('Should extract field references from partitionBy in table calculation templates', () => {
        const result = ValidationService.getTableCalculationFieldIds([
            {
                name: 'percent_of_column_total_with_partition',
                displayName: 'Percent with Partition',
                sql: '',
                template: {
                    type: TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
                    fieldId: 'table_metric',
                    partitionBy: ['table_category', 'table_region'],
                },
            },
            {
                name: 'window_function_with_partition_and_order',
                displayName: 'Window Function',
                sql: '',
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: WindowFunctionType.ROW_NUMBER,
                    fieldId: null,
                    orderBy: [{ fieldId: 'table_date', order: 'asc' }],
                    partitionBy: ['table_country'],
                },
            },
        ]);

        expect(result).toEqual([
            'table_metric', // from first calc's fieldId
            'table_category', // from first calc's partitionBy
            'table_region', // from first calc's partitionBy
            'table_date', // from second calc's orderBy
            'table_country', // from second calc's partitionBy
        ]);
    });

    it('Should handle empty table calculations array', () => {
        const result = ValidationService.getTableCalculationFieldIds([]);
        expect(result).toEqual([]);
    });
});

describe('ValidationService.groupValidationsByRootCause', () => {
    const baseChartError = {
        validationId: null,
        createdAt: new Date(),
        projectUuid: 'projectUuid',
        source: ValidationSourceType.Chart as const,
    };

    const chartModelError = (
        chartUuid: string | undefined,
        name: string,
        views: number,
    ) => ({
        ...baseChartError,
        validationUuid: `validation-${chartUuid ?? name}`,
        name,
        error: "Model error: the model 'orders' no longer exists",
        errorType: ValidationErrorType.Model,
        chartUuid,
        chartViews: views,
        tableName: 'orders',
    });

    it('groups chart model errors from the same deleted model together', () => {
        const summary = ValidationService.groupValidationsByRootCause([
            chartModelError('chart-1', 'Chart one', 5),
            chartModelError('chart-2', 'Chart two', 10),
            {
                ...baseChartError,
                validationUuid: 'validation-3',
                name: 'Chart three',
                error: "Dimension error: the field 'customers_id' no longer exists",
                errorType: ValidationErrorType.Dimension,
                fieldName: 'customers_id',
                tableName: 'customers',
                chartUuid: 'chart-3',
                chartViews: 1,
            },
        ]);

        expect(summary.totalErrors).toBe(3);
        expect(summary.totalAffectedItems).toBe(3);
        expect(summary.groups).toHaveLength(2);

        const [modelGroup, fieldGroup] = summary.groups;
        expect(modelGroup).toMatchObject({
            errorType: ValidationErrorType.Model,
            tableName: 'orders',
            fieldName: null,
            errorCount: 2,
            affectedCharts: 2,
            hasMoreAffectedContent: false,
        });
        // Content sorted by views desc
        expect(modelGroup!.affectedContent.map((c) => c.uuid)).toEqual([
            'chart-2',
            'chart-1',
        ]);
        expect(fieldGroup).toMatchObject({
            errorType: ValidationErrorType.Dimension,
            tableName: 'customers',
            fieldName: 'customers_id',
            errorCount: 1,
        });
    });

    it('dedupes content within a group and counts errors per content', () => {
        const duplicatedError = {
            ...baseChartError,
            name: 'Chart one',
            error: "Dimension error: the field 'orders_status' no longer exists",
            errorType: ValidationErrorType.Dimension,
            fieldName: 'orders_status',
            tableName: 'orders',
            chartUuid: 'chart-1',
            chartViews: 3,
        };
        const summary = ValidationService.groupValidationsByRootCause([
            { ...duplicatedError, validationUuid: 'validation-a' },
            { ...duplicatedError, validationUuid: 'validation-b' },
        ]);

        expect(summary.groups).toHaveLength(1);
        expect(summary.groups[0]!.errorCount).toBe(2);
        expect(summary.groups[0]!.affectedCharts).toBe(1);
        expect(summary.groups[0]!.affectedContent).toHaveLength(1);
        expect(summary.groups[0]!.affectedContent[0]!.errorCount).toBe(2);
        expect(summary.totalAffectedItems).toBe(1);
    });

    it('excludes chart configuration warnings and keeps content without a uuid in counts', () => {
        const summary = ValidationService.groupValidationsByRootCause([
            chartModelError('chart-1', 'Chart one', 0),
            chartModelError(undefined, 'Private content', 0),
            {
                ...baseChartError,
                validationUuid: 'validation-warning',
                name: 'Chart one',
                error: 'dimension is not used in the chart configuration',
                errorType: ValidationErrorType.ChartConfiguration,
                fieldName: 'orders_status',
                chartUuid: 'chart-1',
                chartViews: 0,
            },
        ]);

        expect(summary.totalErrors).toBe(2);
        expect(summary.groups).toHaveLength(1);
        expect(summary.groups[0]!.affectedCharts).toBe(2);
        expect(summary.groups[0]!.affectedContent.map((c) => c.uuid)).toContain(
            null,
        );
    });

    it('groups table and dashboard errors by their model', () => {
        const summary = ValidationService.groupValidationsByRootCause([
            {
                validationId: null,
                createdAt: new Date(),
                projectUuid: 'projectUuid',
                validationUuid: 'validation-table',
                source: ValidationSourceType.Table,
                name: 'orders',
                error: 'Compile error',
                errorType: ValidationErrorType.Model,
            },
            {
                validationId: null,
                createdAt: new Date(),
                projectUuid: 'projectUuid',
                validationUuid: 'validation-dashboard',
                source: ValidationSourceType.Dashboard,
                name: 'My dashboard',
                error: "Table 'orders' no longer exists",
                errorType: ValidationErrorType.Filter,
                fieldName: 'orders_status',
                tableName: 'orders',
                dashboardUuid: 'dashboard-1',
                dashboardViews: 7,
            },
        ]);

        expect(summary.groups).toHaveLength(2);
        expect(summary.groups[0]).toMatchObject({
            errorType: ValidationErrorType.Model,
            tableName: 'orders',
            affectedTables: 1,
        });
        expect(summary.groups[1]).toMatchObject({
            errorType: ValidationErrorType.Filter,
            tableName: 'orders',
            fieldName: 'orders_status',
            affectedDashboards: 1,
        });
    });
});

describe('ValidationService.getValidationSummary', () => {
    const validationService = new ValidationService({
        analytics: analyticsMock,
        validationModel: validationModel as unknown as ValidationModel,
        projectModel: projectModel as unknown as ProjectModel,
        appModel: appModel as unknown as AppModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        lightdashConfig: config,
        spaceModel: spaceModel as unknown as SpaceModel,
        schedulerClient: {} as SchedulerClient,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        featureFlagModel: {} as FeatureFlagModel,
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns grouped summary from stored validations', async () => {
        (validationModel.get as import('vitest').Mock).mockImplementationOnce(
            async () => [
                {
                    validationId: null,
                    createdAt: new Date(),
                    projectUuid: 'projectUuid',
                    validationUuid: 'validation-1',
                    source: ValidationSourceType.Chart,
                    name: 'Chart one',
                    error: "Model error: the model 'orders' no longer exists",
                    errorType: ValidationErrorType.Model,
                    chartUuid: 'chart-1',
                    chartViews: 2,
                    tableName: 'orders',
                },
            ],
        );

        const summary = await validationService.getValidationSummary(
            user,
            'projectUuid',
        );

        expect(summary.totalErrors).toBe(1);
        expect(summary.groups).toHaveLength(1);
        expect(summary.groups[0]).toMatchObject({
            tableName: 'orders',
            errorType: ValidationErrorType.Model,
            affectedCharts: 1,
        });
    });

    it('throws ForbiddenError without manage Validation ability', async () => {
        const restrictedUser = {
            ...user,
            ability: new Ability<[AbilityAction, AnyType]>([]),
        };

        await expect(
            validationService.getValidationSummary(
                restrictedUser,
                'projectUuid',
            ),
        ).rejects.toThrowError(ForbiddenError);
    });

    it('excludes content in spaces the user cannot see, so chip counts match the table', async () => {
        const chartError = (
            chartUuid: string,
            name: string,
            spaceUuid: string,
        ) => ({
            validationId: null,
            createdAt: new Date(),
            projectUuid: 'projectUuid',
            validationUuid: `validation-${chartUuid}`,
            source: ValidationSourceType.Chart,
            name,
            error: "Model error: the model 'orders' no longer exists",
            errorType: ValidationErrorType.Model,
            chartUuid,
            chartViews: 0,
            tableName: 'orders',
            spaceUuid,
        });
        (validationModel.get as import('vitest').Mock).mockImplementationOnce(
            async () => [
                chartError('chart-public', 'Public chart', 'public-space'),
                chartError('chart-private', 'Private chart', 'private-space'),
            ],
        );
        spaceModel.find.mockResolvedValueOnce([
            { uuid: 'public-space' },
            { uuid: 'private-space' },
        ] as AnyType);
        spacePermissionService.getAccessibleSpaceUuids.mockResolvedValueOnce([
            'public-space',
        ] as AnyType);

        const summary = await validationService.getValidationSummary(
            { ...user, role: OrganizationMemberRole.DEVELOPER },
            'projectUuid',
        );

        expect(summary.totalErrors).toBe(1);
        expect(summary.totalAffectedItems).toBe(1);
        expect(summary.groups[0]).toMatchObject({
            errorCount: 1,
            affectedCharts: 1,
        });
        expect(
            summary.groups[0]!.affectedContent.map((content) => content.uuid),
        ).toEqual(['chart-public']);
    });
});
