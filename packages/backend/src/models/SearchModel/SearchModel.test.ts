import { NotFoundError } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { SearchModel } from '.';
import { DashboardsTableName } from '../../database/entities/dashboards';
import { ProjectTableName } from '../../database/entities/projects';
import { SpaceTableName } from '../../database/entities/spaces';

describe('SearchModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const contentVerificationModel = {
        getByContentUuids: jest.fn(),
    };
    const model = new SearchModel({
        database,
        contentVerificationModel,
    } as unknown as ConstructorParameters<typeof SearchModel>[0]);

    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        jest.clearAllMocks();
    });

    test('scopes dashboard chart lookup to the requested project', async () => {
        const dashboardUuid = 'dashboard-uuid';
        const projectUuid = 'project-uuid';

        tracker.on.select(DashboardsTableName).response([]);

        await expect(
            model.getDashboardCharts(dashboardUuid, projectUuid, 1, 20),
        ).rejects.toThrow(NotFoundError);

        const [dashboardLookup] = tracker.history.select;

        expect(dashboardLookup.sql).toContain(SpaceTableName);
        expect(dashboardLookup.sql).toContain(ProjectTableName);
        expect(dashboardLookup.bindings).toContain(dashboardUuid);
        expect(dashboardLookup.bindings).toContain(projectUuid);
        expect(
            contentVerificationModel.getByContentUuids,
        ).not.toHaveBeenCalled();
    });
});
