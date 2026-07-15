import { ProjectMemberRole, PromotionAction } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { GroupsModel } from './GroupsModel';

describe('GroupsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new GroupsModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('only updates allowed project access fields', async () => {
        tracker.on.update(ProjectGroupAccessTableName).responseOnce([
            {
                project_id: 1,
                project_uuid: 'project-uuid',
                group_uuid: 'group-uuid',
                role: ProjectMemberRole.VIEWER,
                role_uuid: null,
            },
        ]);

        await model.updateProjectAccess(
            {
                projectUuid: 'project-uuid',
                groupUuid: 'group-uuid',
            },
            {
                role: ProjectMemberRole.VIEWER,
                project_uuid: 'attacker-project-uuid',
            } as unknown as Parameters<GroupsModel['updateProjectAccess']>[1],
        );

        const [query] = tracker.history.update;
        expect(query.sql).toContain(ProjectGroupAccessTableName);
        expect(query.sql).toContain('set "role" = $1 where');
        expect(query.bindings).not.toContain('attacker-project-uuid');
    });

    it('preserves null role_uuid when unsetting custom project access role', async () => {
        tracker.on.update(ProjectGroupAccessTableName).responseOnce([
            {
                project_id: 1,
                project_uuid: 'project-uuid',
                group_uuid: 'group-uuid',
                role: ProjectMemberRole.VIEWER,
                role_uuid: null,
            },
        ]);

        await model.updateProjectAccess(
            {
                projectUuid: 'project-uuid',
                groupUuid: 'group-uuid',
            },
            {
                role: ProjectMemberRole.VIEWER,
                role_uuid: null,
            },
        );

        const [query] = tracker.history.update;
        expect(query.sql).toContain(ProjectGroupAccessTableName);
        expect(query.sql).toContain('set "role" = $1, "role_uuid" = $2 where');
        expect(query.bindings).toContain(ProjectMemberRole.VIEWER);
        expect(query.bindings).toContain(null);
    });

    it('locks an existing group before replacing memberships as code', async () => {
        tracker.on
            .select(OrganizationTableName)
            .responseOnce({ organization_id: 2 });
        tracker.on
            .select(GroupTableName)
            .responseOnce({ group_uuid: 'group-uuid' });
        tracker.on
            .select(GroupMembershipTableName)
            .responseOnce([{ user_id: 3 }]);
        tracker.on.delete(GroupMembershipTableName).responseOnce(1);
        tracker.on.update(GroupTableName).responseOnce(1);

        await expect(
            model.upsertGroupAsCode({
                organizationUuid: 'organization-uuid',
                name: 'Finance',
                memberEmails: [],
                actorUserUuid: 'actor-user-uuid',
            }),
        ).resolves.toEqual({
            action: PromotionAction.UPDATE,
            groupUuid: 'group-uuid',
        });

        const groupLockIndex = tracker.history.select.findIndex(
            ({ sql }) =>
                sql.includes(`from "${GroupTableName}"`) &&
                sql.includes('for update'),
        );
        const membershipReadIndex = tracker.history.select.findIndex(
            ({ sql }) => sql.includes(`from "${GroupMembershipTableName}"`),
        );
        expect(groupLockIndex).toBeGreaterThanOrEqual(0);
        expect(membershipReadIndex).toBeGreaterThan(groupLockIndex);
    });
});
