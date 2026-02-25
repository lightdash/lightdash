import {
    SEED_GROUP,
    SEED_ORG_1_ADMIN,
    SEED_ORG_2_ADMIN,
    SEED_PROJECT,
    type Group,
    type UpdateGroupWithMembers,
} from '@lightdash/common';
import { type Body } from '../helpers/api-client';
import { anotherLogin, login } from '../helpers/auth';

describe('Groups API', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    it('should return a group to admin', async () => {
        const resp = await admin.get(`api/v1/groups/${SEED_GROUP.groupUuid}`);
        expect(resp.status).toBe(200);
    });

    it('should forbid group outside the organization', async () => {
        const other = await anotherLogin();
        const resp = await other.get(`api/v1/groups/${SEED_GROUP.groupUuid}`, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('should create a group in organization', async () => {
        const groupName = `Org A Group ${Date.now()}`;
        const resp = await admin.post<Body<{ name: string }>>(
            'api/v1/org/groups',
            {
                name: groupName,
            },
        );
        expect(resp.status).toBe(201);
        expect(resp.body.results.name).toBe(groupName);
    });

    it('should return a list of groups in organization', async () => {
        const resp =
            await admin.get<Body<{ data: Group[] }>>('api/v1/org/groups');
        expect(resp.status).toBe(200);
        expect(
            resp.body.results.data.find((group: Group) =>
                group.name.startsWith('Org A Group'),
            ),
        ).toBeDefined();
    });

    it('should not return groups to another organization', async () => {
        const other = await anotherLogin();
        const resp =
            await other.get<Body<{ data: unknown[] }>>('api/v1/org/groups');
        expect(resp.status).toBe(200);
        expect(resp.body.results.data).toHaveLength(0);
    });

    it('should add members to group', async () => {
        const resp = await admin.put(
            `api/v1/groups/${SEED_GROUP.groupUuid}/members/${SEED_ORG_1_ADMIN.user_uuid}`,
        );
        expect([201, 204]).toContain(resp.status);
    });

    it('should delete group from organization', async () => {
        const createResp = await admin.post<Body<{ uuid: string }>>(
            'api/v1/org/groups',
            {
                name: `Test group${Date.now()}`,
            },
        );
        const resp = await admin.delete(
            `api/v1/groups/${createResp.body.results.uuid}`,
        );
        expect(resp.status).toBe(200);
    });

    it('should update group name', async () => {
        const createResp = await admin.post<Body<{ uuid: string }>>(
            'api/v1/org/groups',
            {
                name: `Test group${Date.now()}`,
            },
        );
        const newGroupName = `New name${Date.now()}`;
        const resp = await admin.patch<Body<{ name: string }>>(
            `api/v1/groups/${createResp.body.results.uuid}`,
            { name: newGroupName },
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results.name).toBe(newGroupName);
    });

    it('should get group members', async () => {
        const resp = await admin.get(
            `api/v1/groups/${SEED_GROUP.groupUuid}/members`,
        );
        expect(resp.status).toBe(200);
    });

    it('should successfully update group name and members', async () => {
        const createResp = await admin.post<Body<{ uuid: string }>>(
            'api/v1/org/groups',
            {
                name: `Test group${Date.now()}`,
            },
        );
        const groupUuid = createResp.body.results.uuid;

        const newGroupName = `New Group Name${Date.now()}`;
        const newMembers = [{ userUuid: SEED_ORG_1_ADMIN.user_uuid }];
        const updateResp = await admin.patch<
            Body<{
                name: string;
                members: Array<{ userUuid: string }>;
            }>
        >(`api/v1/groups/${groupUuid}`, {
            name: newGroupName,
            members: newMembers,
        });
        expect(updateResp.status).toBe(200);
        expect(updateResp.body.results.name).toBe(newGroupName);
        expect(updateResp.body.results.members.length).toBe(1);
        expect(updateResp.body.results.members[0].userUuid).toBe(
            SEED_ORG_1_ADMIN.user_uuid,
        );

        // Clear members without changing the name
        const emptyMembership: UpdateGroupWithMembers['members'] = [];
        const clearResp = await admin.patch<
            Body<{
                name: string;
                members: Array<{ userUuid: string }>;
            }>
        >(`api/v1/groups/${groupUuid}`, {
            members: emptyMembership,
        });
        expect(clearResp.status).toBe(200);
        expect(clearResp.body.results.name).toBe(newGroupName);
        expect(clearResp.body.results.members.length).toBe(0);
    });

    it('should not add a user from another org to a group', async () => {
        const createResp = await admin.post<Body<{ uuid: string }>>(
            'api/v1/org/groups',
            {
                name: `Test group 2${Date.now()}`,
            },
        );
        const newMembers = [{ userUuid: SEED_ORG_2_ADMIN.user_uuid }];
        const resp = await admin.patch(
            `api/v1/groups/${createResp.body.results.uuid}`,
            { name: 'New Group Name 2', members: newMembers },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(400);
    });

    describe('Group Project access API', () => {
        it('should add a group access to a project', async () => {
            const resp = await admin.post<
                Body<{
                    groupUuid: string;
                    projectUuid: string;
                    role: string;
                }>
            >(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                { role: 'viewer' },
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results).toEqual({
                groupUuid: SEED_GROUP.groupUuid,
                projectUuid: SEED_PROJECT.project_uuid,
                role: 'viewer',
            });
        });

        it('should not add a group access to a project for another organization', async () => {
            const other = await anotherLogin();
            const resp = await other.post(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                { role: 'viewer' },
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(403);
        });

        it('should update a group access to a project', async () => {
            const resp = await admin.patch<
                Body<{
                    groupUuid: string;
                    projectUuid: string;
                    role: string;
                }>
            >(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                { role: 'editor' },
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results).toEqual({
                groupUuid: SEED_GROUP.groupUuid,
                projectUuid: SEED_PROJECT.project_uuid,
                role: 'editor',
            });
        });

        it('should not update a group access to a project for another organization', async () => {
            const other = await anotherLogin();
            const resp = await other.patch(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                { role: 'editor' },
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(403);
        });

        it('should remove a group access from a project', async () => {
            const resp = await admin.delete(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
            );
            expect(resp.status).toBe(200);
        });

        it('should not remove a group access from a project for another organization', async () => {
            const other = await anotherLogin();
            const resp = await other.delete(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(403);
        });
    });
});
