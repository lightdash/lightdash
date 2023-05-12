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
    config,
    dashboard,
    explore,
    exploreError,
    exploreWithoutDimension,
    exploreWithoutMetric,
    project,
    user,
} from './ValidationService.mock';

jest.mock('../../models/models', () => ({
    savedChartModel: {
        find: jest.fn(async () => [{}]),
        get: jest.fn(async () => chart),
    },
    projectModel: {
        getExploresFromCache: jest.fn(async () => [explore]),
        get: jest.fn(async () => project),
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
            dashboardUuid: null,
            error: "Dimension error: the field 'table_dimension' no longer exists",
            name: 'Test chart',
            projectUuid: 'projectUuid',
            savedChartUuid: 'chartUuid',
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
            dashboardUuid: null,
            error: "Metric error: the field 'table_metric' no longer exists",
            name: 'Test chart',
            projectUuid: 'projectUuid',
            savedChartUuid: 'chartUuid',
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

        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            dashboardUuid: null,
            error: 'Explore error message',
            projectUuid: 'projectUuid',
            savedChartUuid: null,
        });

        expect(errors.map((error) => error.error)[0]).toEqual(
            'Explore error message',
        );
    });
});
