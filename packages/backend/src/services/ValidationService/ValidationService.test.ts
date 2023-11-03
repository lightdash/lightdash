import { TableSelectionType } from '@lightdash/common';
import {
    dashboardModel,
    projectModel,
    savedChartModel,
    spaceModel,
    validationModel,
} from '../../models/models';

import { ValidationService } from './ValidationService';
import {
    chart,
    chartWithJoinedField,
    config,
    dashboard,
    explore,
    exploreError,
    exploreWithJoin,
    exploreWithoutDimension,
    exploreWithoutMetric,
    project,
    tableConfiguration,
} from './ValidationService.mock';

jest.mock('../../clients/clients', () => ({
    schedulerClient: {},
}));

jest.mock('../../models/models', () => ({
    savedChartModel: {
        find: jest.fn(async () => [{}]),
        get: jest.fn(async () => chart),
    },
    projectModel: {
        getExploresFromCache: jest.fn(async () => [explore]),
        get: jest.fn(async () => project),
        getTablesConfiguration: jest.fn(async () => tableConfiguration),
    },
    validationModel: {
        delete: jest.fn(async () => {}),
        create: jest.fn(async () => {}),
    },
    dashboardModel: {
        getAllByProject: jest.fn(async () => [{}]),
        getById: jest.fn(async () => dashboard),
    },
}));

describe('validation', () => {
    const validationService = new ValidationService({
        validationModel,
        projectModel,
        savedChartModel,
        dashboardModel,
        lightdashConfig: config,
        spaceModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Should validate project without errors', async () => {
        expect(
            await validationService.generateValidation(chart.projectUuid),
        ).toEqual([]);
    });
    it('Should validate project with dimension errors', async () => {
        (projectModel.getExploresFromCache as jest.Mock).mockImplementationOnce(
            async () => [exploreWithoutDimension],
        );

        const errors = await validationService.generateValidation(
            chart.projectUuid,
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
            "The chart 'Test chart' is broken on this dashboard.",
        ];
        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
    });

    it('Should validate project with metric errors', async () => {
        (projectModel.getExploresFromCache as jest.Mock).mockImplementationOnce(
            async () => [exploreWithoutMetric],
        );

        const errors = await validationService.generateValidation(
            chart.projectUuid,
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
        (projectModel.getExploresFromCache as jest.Mock).mockImplementationOnce(
            async () => [exploreError],
        );

        const errors = await validationService.generateValidation(
            chart.projectUuid,
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

        expect(errors[0].error).toEqual(
            'Model "valid_explore" has a dimension reference: ${is_completed} which matches no dimension',
        );
    });

    it('Should not show unselected table errors', async () => {
        (projectModel.getExploresFromCache as jest.Mock).mockImplementationOnce(
            async () => [exploreError],
        );

        (
            projectModel.getTablesConfiguration as jest.Mock
        ).mockImplementationOnce(async () => ({
            tableSelection: {
                type: TableSelectionType.WITH_NAMES,
                value: ['another_explore'],
            },
        }));
        const errors = await validationService.generateValidation(
            chart.projectUuid,
        );
        const tableErrors = errors.filter((ve) => ve.source === 'table');

        expect(tableErrors.length).toEqual(0);
    });

    it('Should show unselected table errors on joins', async () => {
        (projectModel.getExploresFromCache as jest.Mock).mockImplementationOnce(
            async () => [
                exploreError,
                {
                    name: 'joined_explore',
                    joinedTables: [{ table: 'valid_explore' }],
                },
            ],
        );

        (
            projectModel.getTablesConfiguration as jest.Mock
        ).mockImplementationOnce(async () => ({
            tableSelection: {
                type: TableSelectionType.WITH_NAMES,
                value: ['joined_explore'],
            },
        }));
        const errors = await validationService.generateValidation(
            chart.projectUuid,
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

        expect(errors[0].error).toEqual(
            'Model "valid_explore" has a dimension reference: ${is_completed} which matches no dimension',
        );
    });
    it('Should validate fields from joined explores', async () => {
        (projectModel.getExploresFromCache as jest.Mock).mockImplementationOnce(
            async () => [explore, exploreWithJoin],
        );
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => chartWithJoinedField,
        );

        const errors = await validationService.generateValidation(
            chart.projectUuid,
        );

        expect(errors.length).toEqual(0);
    });
});
