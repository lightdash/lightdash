import { SpaceMemberRole } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { DashboardUserAccessTableName } from '../database/entities/dashboardAccess';
import { type UtilRepository } from '../utils/UtilRepository';
import { DashboardAccessModel } from './DashboardAccessModel';
import { ModelRepository } from './ModelRepository';

const database = knex({ client: MockClient, dialect: 'pg' });

describe('dashboard direct access read model', () => {
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('does not query for an empty resource list', async () => {
        await expect(
            new DashboardAccessModel(database).getUserAccess([], 'user-uuid', {
                organizationUuid: 'organization-uuid',
            }),
        ).resolves.toEqual({});
        expect(tracker.history.select).toHaveLength(0);
    });

    it('resolves direct user and current group roles', async () => {
        tracker.on.select(DashboardUserAccessTableName).responseOnce([
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
            new DashboardAccessModel(database).getUserAccess(
                ['resource-a', 'resource-without-grants', 'resource-a'],
                'user-uuid',
                { organizationUuid: 'organization-uuid' },
            ),
        ).resolves.toEqual({
            'resource-a': {
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [SpaceMemberRole.EDITOR, SpaceMemberRole.ADMIN],
            },
        });
    });
});

describe('dashboard direct access model wiring', () => {
    it('exposes a memoized DashboardAccessModel', () => {
        const models = new ModelRepository({
            database: {} as Knex,
            lightdashConfig: lightdashConfigMock,
            utils: {} as UtilRepository,
        });
        expect(models.getDashboardAccessModel()).toBeInstanceOf(
            DashboardAccessModel,
        );
        expect(models.getDashboardAccessModel()).toBe(
            models.getDashboardAccessModel(),
        );
    });
});
