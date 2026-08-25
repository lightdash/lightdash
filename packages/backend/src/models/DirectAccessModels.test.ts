import { SpaceMemberRole } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    AppGroupAccessTableName,
    AppUserAccessTableName,
} from '../database/entities/appAccess';
import {
    DashboardGroupAccessTableName,
    DashboardUserAccessTableName,
} from '../database/entities/dashboardAccess';
import {
    SavedChartGroupAccessTableName,
    SavedChartUserAccessTableName,
} from '../database/entities/savedChartAccess';
import {
    SavedSqlGroupAccessTableName,
    SavedSqlUserAccessTableName,
} from '../database/entities/savedSqlAccess';
import { AppAccessModel } from './AppAccessModel';
import { DashboardAccessModel } from './DashboardAccessModel';
import { type DirectAccess } from './directAccessModelUtils';
import { SavedChartAccessModel } from './SavedChartAccessModel';
import { SavedSqlAccessModel } from './SavedSqlAccessModel';

type AccessResult = Record<string, DirectAccess>;

type AccessModel = {
    getUserAccess(
        resourceUuids: string[],
        userUuid: string,
        options?: { trx?: Knex },
    ): Promise<AccessResult>;
};

const database = knex({ client: MockClient, dialect: 'pg' });

const modelCases: Array<{
    name: string;
    model: AccessModel;
    userAccessTable: string;
    groupAccessTable: string;
}> = [
    {
        name: 'dashboard',
        model: new DashboardAccessModel(database),
        userAccessTable: DashboardUserAccessTableName,
        groupAccessTable: DashboardGroupAccessTableName,
    },
    {
        name: 'saved chart',
        model: new SavedChartAccessModel(database),
        userAccessTable: SavedChartUserAccessTableName,
        groupAccessTable: SavedChartGroupAccessTableName,
    },
    {
        name: 'saved SQL',
        model: new SavedSqlAccessModel(database),
        userAccessTable: SavedSqlUserAccessTableName,
        groupAccessTable: SavedSqlGroupAccessTableName,
    },
    {
        name: 'app',
        model: new AppAccessModel(database),
        userAccessTable: AppUserAccessTableName,
        groupAccessTable: AppGroupAccessTableName,
    },
];

describe('direct access read models', () => {
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it.each(modelCases)(
        '$name does not query for an empty resource list',
        async ({ model }) => {
            await expect(model.getUserAccess([], 'user-uuid')).resolves.toEqual(
                {},
            );
            expect(tracker.history.select).toHaveLength(0);
        },
    );

    it.each(modelCases)(
        '$name resolves direct user and current group roles',
        async ({ model, userAccessTable }) => {
            tracker.on.select(userAccessTable).responseOnce([
                {
                    resourceUuid: 'resource-a',
                    organizationUuid: 'organization-uuid',
                    projectUuid: 'project-uuid',
                    role: SpaceMemberRole.VIEWER,
                    groupUuid: null,
                },
                {
                    resourceUuid: 'resource-a',
                    organizationUuid: 'organization-uuid',
                    projectUuid: 'project-uuid',
                    role: SpaceMemberRole.EDITOR,
                    groupUuid: 'group-a',
                },
                {
                    resourceUuid: 'resource-a',
                    organizationUuid: 'organization-uuid',
                    projectUuid: 'project-uuid',
                    role: SpaceMemberRole.ADMIN,
                    groupUuid: 'group-b',
                },
            ]);

            await expect(
                model.getUserAccess(
                    ['resource-a', 'resource-without-grants', 'resource-a'],
                    'user-uuid',
                ),
            ).resolves.toEqual({
                'resource-a': {
                    organizationUuid: 'organization-uuid',
                    projectUuid: 'project-uuid',
                    userRole: SpaceMemberRole.VIEWER,
                    groupRoles: [SpaceMemberRole.EDITOR, SpaceMemberRole.ADMIN],
                },
            });
        },
    );
});
