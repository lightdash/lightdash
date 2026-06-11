import { ProjectMemberRole } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
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
});
