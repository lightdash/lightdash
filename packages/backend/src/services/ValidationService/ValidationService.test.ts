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

describe('validation', () => {
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

        expect({ ...errors[0], createdAt: undefined }).toEqual({
            createdAt: undefined,
            chartUuid: 'chartUuid',
            error: "The field 'table_dimension' no longer exists and is being used as a dimension.",
            lastUpdatedBy: 'David Attenborough',
            name: 'Test chart',
            projectUuid: 'projectUuid',
            summary:
                "Dimension error: the field 'table_dimension' no longer exists",
            table: 'table',
        });

        const expectedErrors: string[] = [
            "Dimension error: the field 'table_dimension' no longer exists",
            "Filter error: the field 'table_dimension' no longer exists",
            "Sorting error: the field 'table_dimension' no longer exists",
            "Table calculation error: the field 'table_dimension' no longer exists",
        ];
        expect(errors.map((error) => error.summary)).toEqual(expectedErrors);
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
            error: "The field 'table_metric' no longer exists and is being used as a metric.",
            lastUpdatedBy: 'David Attenborough',
            name: 'Test chart',
            projectUuid: 'projectUuid',
            summary: "Metric error: the field 'table_metric' no longer exists",
            table: 'table',
        });

        const expectedErrors: string[] = [
            "Metric error: the field 'table_metric' no longer exists",
            "Filter error: the field 'table_metric' no longer exists",
            "Table calculation error: the field 'table_metric' no longer exists",
        ];
        expect(errors.map((error) => error.summary)).toEqual(expectedErrors);
        expect(validationModel.delete).toHaveBeenCalledTimes(1);
        expect(validationModel.create).toHaveBeenCalledTimes(1);
    });
});
