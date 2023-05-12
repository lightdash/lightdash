import {
    dashboardModel,
    projectModel,
    savedChartModel,
    validationModel,
} from '../../models/models';

import { ValidationService } from './ValidationService';
import {
    chart,
    config,
    dashboard,
    explore,
    exploreWithoutDimension,
    exploreWithoutMetric,
    user,
} from './ValidationService.mock';

jest.mock('../../models/models', () => ({
    savedChartModel: {
        find: jest.fn(async () => [{}]),
        get: jest.fn(async () => chart),
    },
    projectModel: {
        getExploresFromCache: jest.fn(async () => [explore]),
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
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Should validate project without errors', async () => {
        expect(
            await validationService.validate(user, chart.projectUuid),
        ).toEqual([]);

        expect(validationModel.delete).toHaveBeenCalledTimes(1);
        expect(validationModel.create).toHaveBeenCalledTimes(0);
    });
    it('Should validate project with dimension errors', async () => {
        (projectModel.getExploresFromCache as jest.Mock).mockImplementationOnce(
            async () => [exploreWithoutDimension],
        );

        const errors = await validationService.validate(
            user,
            chart.projectUuid,
        );

        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            chartUuid: 'chartUuid',
            lastUpdatedBy: 'David Attenborough',
            name: 'Test chart',
            lastUpdatedAt: new Date('2021-01-01'),

            projectUuid: 'projectUuid',
            error: "Dimension error: the field 'table_dimension' no longer exists",
            table: 'table',
        });

        const expectedErrors: string[] = [
            "Dimension error: the field 'table_dimension' no longer exists",
            "Filter error: the field 'table_dimension' no longer exists",
            "Sorting error: the field 'table_dimension' no longer exists",
            "The chart 'Test chart' is broken on this dashboard.", // Dashboard error
        ];
        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
        expect(validationModel.delete).toHaveBeenCalledTimes(1);
        expect(validationModel.create).toHaveBeenCalledTimes(1);
    });

    it('Should validate project with metric errors', async () => {
        (projectModel.getExploresFromCache as jest.Mock).mockImplementationOnce(
            async () => [exploreWithoutMetric],
        );

        const errors = await validationService.validate(
            user,
            chart.projectUuid,
        );

        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            chartUuid: 'chartUuid',
            lastUpdatedBy: 'David Attenborough',
            name: 'Test chart',
            lastUpdatedAt: new Date('2021-01-01'),
            projectUuid: 'projectUuid',
            error: "Metric error: the field 'table_metric' no longer exists",
            table: 'table',
        });

        const expectedErrors: string[] = [
            "Metric error: the field 'table_metric' no longer exists",
            "Filter error: the field 'table_metric' no longer exists",
            "The chart 'Test chart' is broken on this dashboard.", // Dashboard error
        ];
        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
        expect(validationModel.delete).toHaveBeenCalledTimes(1);
        expect(validationModel.create).toHaveBeenCalledTimes(1);
    });
});
