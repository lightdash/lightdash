import {
    projectModel,
    savedChartModel,
    validationModel,
} from '../../models/models';

import { ValidationService } from './ValidationService';
import {
    chart,
    config,
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
}));

describe('share', () => {
    const validationService = new ValidationService({
        validationModel,
        projectModel,
        savedChartModel,
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

        expect(errors.length).toEqual(5);
        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            chartUuid: 'chartUuid',
            error: 'dimension not found table_dimension',
            lastUpdatedBy: 'David Attenborough',
            name: 'Test chart',
            projectUuid: 'projectUuid',
            summary: 'dimension not found table_dimension',
            table: 'table',
        });

        const expectedErrors: string[] = [
            'dimension not found table_dimension',
            'filter not found table_dimension',
            'sort not found table_dimension',
            'table calculation not found table_dimension',
            'table column order found table_dimension',
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

        expect(errors.length).toEqual(4);
        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            chartUuid: 'chartUuid',
            error: 'metric not found table_metric',
            lastUpdatedBy: 'David Attenborough',
            name: 'Test chart',
            projectUuid: 'projectUuid',
            summary: 'metric not found table_metric',
            table: 'table',
        });

        const expectedErrors: string[] = [
            'metric not found table_metric',
            'filter not found table_metric',
            'table calculation not found table_metric',
            'table column order found table_metric',
        ];
        expect(errors.map((error) => error.error)).toEqual(expectedErrors);
        expect(validationModel.delete).toHaveBeenCalledTimes(1);
        expect(validationModel.create).toHaveBeenCalledTimes(1);
    });
});
