import {
    TableCalculationTemplateType,
    TableSelectionType,
    ValidationTarget,
    WindowFunctionType,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { ValidationModel } from '../../models/ValidationModel/ValidationModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
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
    exploreWithoutDimension,
    exploreWithoutMetric,
    project,
    tableConfiguration,
} from './ValidationService.mock';

const savedChartModel = {
    findChartsForValidation: jest.fn(async () => [chartForValidation]),
};
const projectModel = {
    findExploresFromCache: jest.fn(async () => ({
        [explore.name]: explore,
    })),
    get: jest.fn(async () => project),
    getTablesConfiguration: jest.fn(async () => tableConfiguration),
};
const validationModel = {
    delete: jest.fn(async () => {}),
    create: jest.fn(async () => {}),
    get: jest.fn(async () => []),
};
const dashboardModel = {
    findDashboardsForValidation: jest.fn(async () => [dashboardForValidation]),
};

describe('validation', () => {
    const validationService = new ValidationService({
        analytics: analyticsMock,
        validationModel: validationModel as unknown as ValidationModel,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        lightdashConfig: config,
        spaceModel: {} as SpaceModel,
        schedulerClient: {} as SchedulerClient,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Should validate project without errors', async () => {
        expect(
            await validationService.generateValidation('projectUuid'),
        ).toEqual([]);
    });
    it('Should validate project with dimension errors', async () => {
        (
            projectModel.findExploresFromCache as jest.Mock
        ).mockImplementationOnce(async () => [exploreWithoutDimension]);

        const errors = await validationService.generateValidation(
            'projectUuid',
        );

        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            error: "Dimension error: the field 'table_dimension' no longer exists",
            errorType: 'dimension',
            fieldName: 'table_dimension',
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
            projectModel.findExploresFromCache as jest.Mock
        ).mockImplementationOnce(async () => [exploreWithoutMetric]);

        const errors = await validationService.generateValidation(
            'projectUuid',
        );

        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            error: "Metric error: the field 'table_metric' no longer exists",
            errorType: 'metric',
            fieldName: 'table_metric',
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

    it('Should validate project with table errors', async () => {
        (
            projectModel.findExploresFromCache as jest.Mock
        ).mockImplementationOnce(async () => [exploreError]);

        const errors = await validationService.generateValidation(
            'projectUuid',
        );

        const tableErrors = errors.filter((ve) => ve.source === 'table');

        expect({ ...tableErrors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            name: 'valid_explore',
            modelName: 'valid_explore',
            error: 'Model "valid_explore" has a dimension reference: ${is_completed} which matches no dimension',
            errorType: 'model',
            projectUuid: 'projectUuid',
            source: 'table',
        });

        expect(errors[0]!.error).toEqual(
            'Model "valid_explore" has a dimension reference: ${is_completed} which matches no dimension',
        );
    });

    it('Should not show unselected table errors', async () => {
        (
            projectModel.findExploresFromCache as jest.Mock
        ).mockImplementationOnce(async () => [exploreError]);

        (
            projectModel.getTablesConfiguration as jest.Mock
        ).mockImplementationOnce(async () => ({
            tableSelection: {
                type: TableSelectionType.WITH_NAMES,
                value: ['another_explore'],
            },
        }));
        const errors = await validationService.generateValidation(
            'projectUuid',
        );
        const tableErrors = errors.filter((ve) => ve.source === 'table');

        expect(tableErrors.length).toEqual(0);
    });

    it('Should show unselected table errors on joins', async () => {
        (
            projectModel.findExploresFromCache as jest.Mock
        ).mockImplementationOnce(async () => [
            exploreError,
            {
                name: 'joined_explore',
                joinedTables: [{ table: 'valid_explore' }],
            },
        ]);

        (
            projectModel.getTablesConfiguration as jest.Mock
        ).mockImplementationOnce(async () => ({
            tableSelection: {
                type: TableSelectionType.WITH_NAMES,
                value: ['joined_explore'],
            },
        }));
        const errors = await validationService.generateValidation(
            'projectUuid',
        );
        const tableErrors = errors.filter((ve) => ve.source === 'table');

        expect(tableErrors.length).toEqual(1);

        expect({ ...tableErrors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            name: 'valid_explore',
            modelName: 'valid_explore',
            error: 'Model "valid_explore" has a dimension reference: ${is_completed} which matches no dimension',
            errorType: 'model',
            projectUuid: 'projectUuid',
            source: 'table',
        });

        expect(errors[0]!.error).toEqual(
            'Model "valid_explore" has a dimension reference: ${is_completed} which matches no dimension',
        );
    });

    it('Should validate only tables in project', async () => {
        (
            projectModel.findExploresFromCache as jest.Mock
        ).mockImplementationOnce(async () => [
            exploreError,
            exploreWithoutDimension,
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
            undefined,
            new Set([ValidationTarget.TABLES]),
        );

        const expectedErrors: string[] = [
            'Model "valid_explore" has a dimension reference: ${is_completed} which matches no dimension',
        ];

        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
    });

    it('Should validate only charts in project', async () => {
        (
            projectModel.findExploresFromCache as jest.Mock
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
            projectModel.findExploresFromCache as jest.Mock
        ).mockImplementationOnce(async () => [
            exploreError,
            exploreWithoutDimension,
        ]);

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

    it('Should validate only tables and charts in project', async () => {
        (
            projectModel.findExploresFromCache as jest.Mock
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
            'Model "valid_explore" has a dimension reference: ${is_completed} which matches no dimension',
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
            projectModel.findExploresFromCache as jest.Mock
        ).mockImplementationOnce(async () => [explore, exploreWithJoin]);
        (
            savedChartModel.findChartsForValidation as jest.Mock
        ).mockImplementationOnce(async () => [
            chartForValidationWithJoinedField,
        ]);

        const errors = await validationService.generateValidation(
            'projectUuid',
        );

        expect(errors.length).toEqual(0);
    });

    it('Should validate custom metric filters', async () => {
        (
            projectModel.findExploresFromCache as jest.Mock
        ).mockImplementationOnce(async () => [explore, exploreWithJoin]);

        (
            savedChartModel.findChartsForValidation as jest.Mock
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
            projectModel.findExploresFromCache as jest.Mock
        ).mockImplementationOnce(async () => [explore, additionalExplore]);

        (
            savedChartModel.findChartsForValidation as jest.Mock
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
