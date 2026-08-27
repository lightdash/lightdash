import { SpaceMemberRole } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { AppUserAccessTableName } from '../database/entities/appAccess';
import { DashboardUserAccessTableName } from '../database/entities/dashboardAccess';
import { type UtilRepository } from '../utils/UtilRepository';
import { AppAccessModel } from './AppAccessModel';
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

describe('app direct access read model', () => {
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('does not query for an empty resource list', async () => {
        await expect(
            new AppAccessModel(database).getUserAccess([], 'user-uuid', {
                organizationUuid: 'organization-uuid',
            }),
        ).resolves.toEqual({});
        expect(tracker.history.select).toHaveLength(0);
    });

    it('preserves personal app location while grouping user and group roles', async () => {
        tracker.on.select(AppUserAccessTableName).responseOnce([
            {
                resourceUuid: 'app-a',
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
                spaceUuid: null,
                role: SpaceMemberRole.VIEWER,
                groupUuid: null,
            },
            {
                resourceUuid: 'app-a',
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
                spaceUuid: null,
                role: SpaceMemberRole.EDITOR,
                groupUuid: 'group-a',
            },
        ]);

        await expect(
            new AppAccessModel(database).getUserAccess(
                ['app-a', 'app-a'],
                'user-uuid',
                { organizationUuid: 'organization-uuid' },
            ),
        ).resolves.toEqual({
            'app-a': {
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
                spaceUuid: null,
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [SpaceMemberRole.EDITOR],
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

describe('app direct access model wiring', () => {
    it('exposes a memoized AppAccessModel', () => {
        const models = new ModelRepository({
            database: {} as Knex,
            lightdashConfig: lightdashConfigMock,
            utils: {} as UtilRepository,
        });
        expect(models.getAppAccessModel()).toBeInstanceOf(AppAccessModel);
        expect(models.getAppAccessModel()).toBe(models.getAppAccessModel());
    });
});
