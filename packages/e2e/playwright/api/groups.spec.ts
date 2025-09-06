import {
    SEED_GROUP,
    SEED_ORG_1_ADMIN,
    SEED_ORG_2_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { expect, test } from '@playwright/test';
import { anotherLogin, login } from '../support/auth';

test.describe('Groups API', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('should return a group to admin', async ({ request }) => {
        const response = await request.get(
            `api/v1/groups/${SEED_GROUP.groupUuid}`,
        );
        expect(response.status()).toBe(200);
    });

    test('should forbid group outside the organization', async ({
        request,
    }) => {
        await anotherLogin(request);
        const response = await request.get(
            `api/v1/groups/${SEED_GROUP.groupUuid}`,
        );
        expect(response.status()).toBe(403);
    });

    test('should create a group in organization', async ({ request }) => {
        const groupName = `Org A Group ${new Date().getTime()}`;
        const response = await request.post('api/v1/org/groups', {
            data: {
                name: groupName,
            },
        });
        expect(response.status()).toBe(201);

        const body = await response.json();
        expect(body.results.name).toBe(groupName);
    });

    test('should return a list of groups in organization', async ({
        request,
    }) => {
        const response = await request.get('api/v1/org/groups');
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(
            body.results.data.find((group: { name: string }) =>
                group.name.startsWith('Org A Group'),
            ),
        ).toBeDefined();
    });

    test('should not return groups to another organization', async ({
        request,
    }) => {
        await anotherLogin(request);
        const response = await request.get('api/v1/org/groups');
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.results.data).toHaveLength(0);
    });

    test('should add members to group', async ({ request }) => {
        const response = await request.put(
            `api/v1/groups/${SEED_GROUP.groupUuid}/members/${SEED_ORG_1_ADMIN.user_uuid}`,
        );
        expect(response.status()).toBe(204);
    });

    test('should delete group from organization', async ({ request }) => {
        const createResponse = await request.post('api/v1/org/groups', {
            data: {
                name: `Test group${new Date().getTime()}`,
            },
        });
        expect(createResponse.status()).toBe(201);

        const createBody = await createResponse.json();
        const deleteResponse = await request.delete(
            `api/v1/groups/${createBody.results.uuid}`,
        );
        expect(deleteResponse.status()).toBe(200);
    });

    test('should update group name', async ({ request }) => {
        const createResponse = await request.post('api/v1/org/groups', {
            data: {
                name: `Test group${new Date().getTime()}`,
            },
        });
        expect(createResponse.status()).toBe(201);

        const createBody = await createResponse.json();
        const newGroupName = `New name${new Date().getTime()}`;

        const updateResponse = await request.patch(
            `api/v1/groups/${createBody.results.uuid}`,
            {
                data: {
                    name: newGroupName,
                },
            },
        );
        expect(updateResponse.status()).toBe(200);

        const updateBody = await updateResponse.json();
        expect(updateBody.results.name).toBe(newGroupName);
    });

    test('should get group members', async ({ request }) => {
        const response = await request.get(
            `api/v1/groups/${SEED_GROUP.groupUuid}/members`,
        );
        expect(response.status()).toBe(200);
    });

    test('should successfully update group name and members', async ({
        request,
    }) => {
        const createResponse = await request.post('api/v1/org/groups', {
            data: {
                name: `Test group${new Date().getTime()}`,
            },
        });
        expect(createResponse.status()).toBe(201);

        const createBody = await createResponse.json();
        const newGroupName = `New Group Name${new Date().getTime()}`;
        const newMembers = [{ userUuid: SEED_ORG_1_ADMIN.user_uuid }];

        const updateResponse = await request.patch(
            `api/v1/groups/${createBody.results.uuid}`,
            {
                data: {
                    name: newGroupName,
                    members: newMembers,
                },
            },
        );
        expect(updateResponse.status()).toBe(200);

        const updateBody = await updateResponse.json();
        expect(updateBody.results.name).toBe(newGroupName);
        expect(updateBody.results.members.length).toBe(1);
        expect(updateBody.results.members[0].userUuid).toBe(
            SEED_ORG_1_ADMIN.user_uuid,
        );

        const clearResponse = await request.patch(
            `api/v1/groups/${createBody.results.uuid}`,
            {
                data: {
                    members: [],
                },
            },
        );
        expect(clearResponse.status()).toBe(200);

        const clearBody = await clearResponse.json();
        expect(clearBody.results.name).toBe(newGroupName);
        expect(clearBody.results.members.length).toBe(0);
    });

    test('should not add a user from another org to a group', async ({
        request,
    }) => {
        const createResponse = await request.post('api/v1/org/groups', {
            data: {
                name: `Test group 2${new Date().getTime()}`,
            },
        });
        expect(createResponse.status()).toBe(201);

        const createBody = await createResponse.json();
        const newGroupName = 'New Group Name 2';
        const newMembers = [{ userUuid: SEED_ORG_2_ADMIN.user_uuid }];

        const updateResponse = await request.patch(
            `api/v1/groups/${createBody.results.uuid}`,
            {
                data: {
                    name: newGroupName,
                    members: newMembers,
                },
            },
        );
        expect(updateResponse.status()).toBe(400);
    });

    test.describe('Group Project access API', () => {
        test('should add a group access to a project', async ({ request }) => {
            const response = await request.post(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                {
                    data: {
                        role: 'viewer',
                    },
                },
            );
            expect(response.status()).toBe(200);

            const body = await response.json();
            expect(body.results).toEqual({
                groupUuid: SEED_GROUP.groupUuid,
                projectUuid: SEED_PROJECT.project_uuid,
                role: 'viewer',
            });
        });

        test('should not add a group access to a project for another organization', async ({
            request,
        }) => {
            await anotherLogin(request);
            const response = await request.post(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                {
                    data: {
                        role: 'viewer',
                    },
                },
            );
            expect(response.status()).toBe(403);
        });

        test('should update a group access to a project', async ({
            request,
        }) => {
            const response = await request.patch(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                {
                    data: {
                        role: 'editor',
                    },
                },
            );
            expect(response.status()).toBe(200);

            const body = await response.json();
            expect(body.results).toEqual({
                groupUuid: SEED_GROUP.groupUuid,
                projectUuid: SEED_PROJECT.project_uuid,
                role: 'editor',
            });
        });

        test('should not update a group access to a project for another organization', async ({
            request,
        }) => {
            await anotherLogin(request);
            const response = await request.patch(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                {
                    data: {
                        role: 'editor',
                    },
                },
            );
            expect(response.status()).toBe(403);
        });

        test('should remove a group access from a project', async ({
            request,
        }) => {
            const response = await request.delete(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
            );
            expect(response.status()).toBe(200);
        });

        test('should not remove a group access from a project for another organization', async ({
            request,
        }) => {
            await anotherLogin(request);
            const response = await request.delete(
                `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
            );
            expect(response.status()).toBe(403);
        });
    });
});
