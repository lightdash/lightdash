import { formatValue, NumberStyle } from 'common';
import { analytics } from '../../analytics/client';
import {
    jobModel,
    onboardingModel,
    projectModel,
    savedChartModel,
} from '../../models/models';
import { ProjectService } from './ProjectService';
import {
    allExplores,
    defaultProject,
    expectedAllExploreSummary,
    expectedCatalog,
    expectedExploreSummaryFilteredByName,
    expectedExploreSummaryFilteredByTags,
    expectedSqlResults,
    projectAdapterMock,
    spacesWithSavedCharts,
    tablesConfiguration,
    tablesConfigurationWithNames,
    tablesConfigurationWithTags,
    user,
} from './ProjectService.mock';

jest.mock('../../analytics/client', () => ({
    analytics: {
        track: jest.fn(),
    },
}));

jest.mock('../../models/models', () => ({
    projectModel: {
        getTablesConfiguration: jest.fn(async () => tablesConfiguration),
        updateTablesConfiguration: jest.fn(),
        getExploresFromCache: jest.fn(async () => allExplores),
        lockProcess: jest.fn((projectUuid, fun) => fun()),
    },
    onboardingModel: {},
    savedChartModel: {
        getAllSpaces: jest.fn(async () => spacesWithSavedCharts),
    },
    jobModel: {},
}));

describe('ProjectService', () => {
    const { projectUuid } = defaultProject;
    const service = new ProjectService({
        projectModel,
        onboardingModel,
        savedChartModel,
        jobModel,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    test('should get dashboard by uuid', async () => {
        service.projectAdapters[projectUuid] = projectAdapterMock;

        const result = await service.runSqlQuery(user, projectUuid, 'fake sql');

        expect(result).toEqual(expectedSqlResults);
        expect(analytics.track).toHaveBeenCalledTimes(1);
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'sql.executed',
            }),
        );
    });
    test('should get project catalog', async () => {
        const results = await service.getCatalog(user, projectUuid);

        expect(results).toEqual(expectedCatalog);
    });
    test('should get tables configuration', async () => {
        const result = await service.getTablesConfiguration(user, projectUuid);
        expect(result).toEqual(tablesConfiguration);
    });
    test('should update tables configuration', async () => {
        await service.updateTablesConfiguration(
            user,
            projectUuid,
            tablesConfigurationWithNames,
        );
        expect(projectModel.updateTablesConfiguration).toHaveBeenCalledTimes(1);
        expect(analytics.track).toHaveBeenCalledTimes(1);
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'project_tables_configuration.updated',
            }),
        );
    });
    describe('getAllExploresSummary', () => {
        test('should get all explores summary without filtering', async () => {
            const result = await service.getAllExploresSummary(
                user,
                projectUuid,
                false,
            );
            expect(result).toEqual(expectedAllExploreSummary);
        });
        test('should get all explores summary with filtering', async () => {
            const result = await service.getAllExploresSummary(
                user,
                projectUuid,
                true,
            );
            expect(result).toEqual(expectedAllExploreSummary);
        });
        test('should get explores summary filtered by tag', async () => {
            (
                projectModel.getTablesConfiguration as jest.Mock
            ).mockImplementationOnce(async () => tablesConfigurationWithTags);
            const result = await service.getAllExploresSummary(
                user,
                projectUuid,
                true,
            );
            expect(result).toEqual(expectedExploreSummaryFilteredByTags);
        });
        test('should get explores summary filtered by name', async () => {
            (
                projectModel.getTablesConfiguration as jest.Mock
            ).mockImplementationOnce(async () => tablesConfigurationWithNames);
            const result = await service.getAllExploresSummary(
                user,
                projectUuid,
                true,
            );
            expect(result).toEqual(expectedExploreSummaryFilteredByName);
        });
    });

    describe('format and round', () => {
        test('formatValue should return the right format', async () => {
            expect(formatValue('km', undefined, 5)).toEqual('5 km');
            expect(formatValue('km', undefined, '5')).toEqual('5 km');

            expect(formatValue('mi', undefined, 5)).toEqual('5 mi');
            expect(formatValue('usd', undefined, 5)).toEqual('$5');
            expect(formatValue('gbp', undefined, 5)).toEqual('£5');
            expect(formatValue('eur', undefined, 5)).toEqual('€5');
            expect(formatValue('percent', undefined, 5)).toEqual('500%');
            expect(formatValue('percent', undefined, 0.05)).toEqual('5%');
            expect(formatValue('percent', undefined, '5')).toEqual('500%');
            expect(formatValue('percent', undefined, 'foo')).toEqual('foo');
            expect(formatValue('percent', undefined, false)).toEqual('false');

            expect(formatValue('', undefined, 5)).toEqual('5');
            expect(formatValue(undefined, undefined, 5)).toEqual('5');
        });
        test('formatValue should return the right round', async () => {
            expect(formatValue(undefined, 2, 5)).toEqual('5.00');
            expect(formatValue(undefined, 2, 5.001)).toEqual('5.00');
            expect(formatValue(undefined, 2, 5.555)).toEqual('5.55');
            expect(formatValue(undefined, 2, 5.5555)).toEqual('5.56');
            expect(formatValue(undefined, 2, 5.9999999)).toEqual('6.00');

            expect(formatValue(undefined, 0, 5)).toEqual('5');
            expect(formatValue(undefined, 0, 5.001)).toEqual('5');
            expect(formatValue(undefined, 0, 5.9999999)).toEqual('6');

            // negative rounding not supported
            expect(formatValue(undefined, -1, 5)).toEqual('5');

            expect(formatValue(undefined, 2, 'foo')).toEqual('foo');
            expect(formatValue(undefined, 2, false)).toEqual('false');

            expect(formatValue(undefined, 10, 5)).toEqual('5.0000000000');
            expect(formatValue(undefined, 10, 5.001)).toEqual('5.0010000000');
            expect(formatValue(undefined, 10, 5.9999999)).toEqual(
                '5.9999999000',
            );
        });

        test('formatValue should return the right format and round', async () => {
            expect(formatValue('km', 2, 5)).toEqual('5.00 km');
            expect(formatValue('mi', 4, 5)).toEqual('5.0000 mi');
            expect(formatValue('usd', 2, 5)).toEqual('$5.00');
            expect(formatValue('usd', 0, 5.0)).toEqual('$5');
            expect(formatValue('usd', 2, '5.0000')).toEqual('$5.00');
            expect(formatValue('gbp', 2, 5)).toEqual('£5.00');
            expect(formatValue('eur', 2, 5)).toEqual('€5.00');
            expect(formatValue('percent', 2, 5)).toEqual('500.00%');
            expect(formatValue('percent', 2, 0.05)).toEqual('5.00%');
            expect(formatValue('percent', 2, '5')).toEqual('500.00%');
            expect(formatValue('percent', 2, 0.0511)).toEqual('5.11%');
            expect(formatValue('percent', 4, 0.0511)).toEqual('5.1100%');
            expect(formatValue('percent', 2, 'foo')).toEqual('foo');
            expect(formatValue('percent', 2, false)).toEqual('false');
            expect(formatValue('', 2, 5)).toEqual('5.00');
        });

        test('formatValue should return the right style', async () => {
            const T = NumberStyle.THOUSANDS;
            const M = NumberStyle.MILLIONS;
            const B = NumberStyle.BILLIONS;
            expect(formatValue(undefined, undefined, 5, T)).toEqual('0.005K');
            expect(formatValue(undefined, undefined, 5, M)).toEqual(
                '0.000005M',
            );
            expect(formatValue(undefined, undefined, 500000, B)).toEqual(
                '0.0005B',
            );
            expect(formatValue(undefined, undefined, 5, B)).toEqual('5e-9B');
            expect(formatValue(undefined, 2, 5, M)).toEqual('0.00M');

            expect(formatValue('km', 2, 5000, T)).toEqual('5.00K km');
            expect(formatValue('mi', 4, 50000, T)).toEqual('50.0000K mi');
            expect(formatValue('usd', 2, 5000, T)).toEqual('$5.00K');
            expect(formatValue('usd', 2, 5000000, T)).toEqual('$5000.00K');
            expect(formatValue('usd', 2, 5000000, M)).toEqual('$5.00M');

            expect(formatValue('usd', 2, 4, T)).toEqual('$0.00K');
            expect(formatValue('usd', 3, 4, T)).toEqual('$0.004K');

            expect(formatValue('usd', 2, 5000000, M)).toEqual('$5.00M');
            expect(formatValue('usd', 2, 5000000000, M)).toEqual('$5000.00M');
            expect(formatValue('usd', 2, 5000000000, B)).toEqual('$5.00B');

            expect(formatValue('usd', 0, 5000.0, T)).toEqual('$5K');
            expect(formatValue('usd', 2, '5000', T)).toEqual('$5.00K');
            expect(formatValue('gbp', 2, 5000, T)).toEqual('£5.00K');
            expect(formatValue('eur', 2, 5000, T)).toEqual('€5.00K');
            expect(formatValue('percent', 2, 0.05, T)).toEqual('5.00%'); // No affects percent
            expect(formatValue('', 2, 5000, T)).toEqual('5.00K');
        });
    });
});
