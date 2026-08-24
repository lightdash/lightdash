import { SpaceMemberRole } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    AppGroupAccessTableName,
    AppUserAccessTableName,
} from '../database/entities/appAccess';
import { AppsTableName } from '../database/entities/apps';
import {
    DashboardGroupAccessTableName,
    DashboardUserAccessTableName,
} from '../database/entities/dashboardAccess';
import { DashboardsTableName } from '../database/entities/dashboards';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { ProjectTableName } from '../database/entities/projects';
import {
    SavedChartGroupAccessTableName,
    SavedChartUserAccessTableName,
} from '../database/entities/savedChartAccess';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SavedSqlTableName } from '../database/entities/savedSql';
import {
    SavedSqlGroupAccessTableName,
    SavedSqlUserAccessTableName,
} from '../database/entities/savedSqlAccess';
import { SpaceTableName } from '../database/entities/spaces';
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
    resourceTable: string;
}> = [
    {
        name: 'dashboard',
        model: new DashboardAccessModel(database),
        userAccessTable: DashboardUserAccessTableName,
        groupAccessTable: DashboardGroupAccessTableName,
        resourceTable: DashboardsTableName,
    },
    {
        name: 'saved chart',
        model: new SavedChartAccessModel(database),
        userAccessTable: SavedChartUserAccessTableName,
        groupAccessTable: SavedChartGroupAccessTableName,
        resourceTable: SavedChartsTableName,
    },
    {
        name: 'saved SQL',
        model: new SavedSqlAccessModel(database),
        userAccessTable: SavedSqlUserAccessTableName,
        groupAccessTable: SavedSqlGroupAccessTableName,
        resourceTable: SavedSqlTableName,
    },
    {
        name: 'app',
        model: new AppAccessModel(database),
        userAccessTable: AppUserAccessTableName,
        groupAccessTable: AppGroupAccessTableName,
        resourceTable: AppsTableName,
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
        '$name resolves direct user and current group roles in one query',
        async ({ model, userAccessTable, groupAccessTable, resourceTable }) => {
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

            expect(tracker.history.select).toHaveLength(1);
            const [query] = tracker.history.select;
            expect(query.sql).toContain(`"${userAccessTable}"`);
            expect(query.sql).toContain(`"${groupAccessTable}"`);
            expect(query.sql).toContain(`"${resourceTable}"`);
            expect(query.sql).toContain(`"${GroupMembershipTableName}"`);
            expect(query.sql).toContain(
                `"${OrganizationMembershipsTableName}"`,
            );
            expect(query.sql).toContain(
                `"${OrganizationMembershipCustomRolesTableName}"`,
            );
            expect(query.sql).toContain(`"${ProjectMembershipsTableName}"`);
            expect(query.sql).toContain(`"${ProjectGroupAccessTableName}"`);
            expect(query.sql).toContain(`"${ProjectTableName}"`);
            expect(query.sql).toContain(`"${OrganizationTableName}"`);
            expect(query.sql).toContain('union all');
            expect(query.bindings).toContain('user-uuid');
            expect(
                query.bindings.filter((binding) => binding === 'resource-a'),
            ).toHaveLength(2);
            expect(query.bindings).toContain('resource-without-grants');
            expect(query.sql).toContain(
                `"${GroupMembershipTableName}"."organization_id" = "${ProjectTableName}"."organization_id"`,
            );
            expect(query.sql).toContain(`"users"."is_active" = TRUE`);
        },
    );

    it('derives dashboard tenancy through its parent space', async () => {
        tracker.on.select(DashboardUserAccessTableName).responseOnce([]);

        await new DashboardAccessModel(database).getUserAccess(
            ['dashboard-uuid'],
            'user-uuid',
        );

        const [query] = tracker.history.select;
        expect(query.sql).toContain(`"${SpaceTableName}"`);
        expect(query.sql).toContain(
            `"${SpaceTableName}"."space_id" = "${DashboardsTableName}"."space_id"`,
        );
    });

    it.each([
        {
            name: 'saved chart',
            model: new SavedChartAccessModel(database),
            userAccessTable: SavedChartUserAccessTableName,
            resourceTable: SavedChartsTableName,
        },
        {
            name: 'saved SQL',
            model: new SavedSqlAccessModel(database),
            userAccessTable: SavedSqlUserAccessTableName,
            resourceTable: SavedSqlTableName,
        },
    ])(
        '$name excludes dashboard-owned resources',
        async ({ model, userAccessTable, resourceTable }) => {
            tracker.on.select(userAccessTable).responseOnce([]);

            await model.getUserAccess(['resource-uuid'], 'user-uuid');

            const [query] = tracker.history.select;
            expect(query.sql).toContain(
                `"${resourceTable}"."dashboard_uuid" is null`,
            );
        },
    );
});
