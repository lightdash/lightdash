import { projectModel } from '../../models/models';
import { ProjectService } from './ProjectService';
import {
    expectedSqlResults,
    projectAdapterMock,
    user,
} from './ProjectService.mock';
import { analytics } from '../../analytics/client';

jest.mock('../../analytics/client', () => ({
    analytics: {
        track: jest.fn(),
    },
}));

jest.mock('../../models/models', () => ({
    projectModel: {},
}));

describe('DashboardService', () => {
    const projectUuid = 'projectUuid';
    const service = new ProjectService({
        projectModel,
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
});
