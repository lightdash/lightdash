import { SEED_GROUP, SEED_ORG_1_ADMIN } from '@lightdash/common';
import { expect, test } from '@playwright/test';
import { login } from '../support/auth';

test.describe('Attributes API', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('creates an attribute with users and groups', async ({ request }) => {
        const name = `example_attribute${Math.random()}`;

        const createBody = {
            name,
            users: [
                { userUuid: SEED_ORG_1_ADMIN.user_uuid, value: 'User Value' },
            ],
            groups: [{ groupUuid: SEED_GROUP.groupUuid, value: 'Group Value' }],
            attributeDefault: null,
        };

        const response = await request.post('/api/v1/org/attributes', {
            data: createBody,
        });
        expect(response.status()).toBe(201);

        const body = await response.json();
        const { uuid } = body.results;

        const getResponse = await request.get(`/api/v1/org/attributes`);
        const getBody = await getResponse.json();

        const attribute = getBody.results.find(
            (a: { uuid: string }) => a.uuid === uuid,
        );
        expect(attribute.name).toBe(name);
        expect(attribute.users).toHaveLength(1);
        expect(attribute.users[0].userUuid).toBe(SEED_ORG_1_ADMIN.user_uuid);
        expect(attribute.users[0].value).toBe('User Value');
        expect(attribute.groups).toHaveLength(1);
        expect(attribute.groups[0].groupUuid).toBe(SEED_GROUP.groupUuid);
        expect(attribute.groups[0].value).toBe('Group Value');

        await request.delete(`/api/v1/org/attributes/${uuid}`);
    });

    test('creates an empty attribute and updates with users and groups', async ({
        request,
    }) => {
        const name = `example_attribute${Math.random()}`;
        const newName = `example_attribute${Math.random()}`;

        const response = await request.post('/api/v1/org/attributes', {
            data: {
                name,
                users: [],
                groups: [],
                attributeDefault: null,
            },
        });
        expect(response.status()).toBe(201);

        const body = await response.json();
        expect(body.results.users).toHaveLength(0);
        expect(body.results.groups).toHaveLength(0);

        const { uuid } = body.results;
        const putResponse = await request.put(
            `/api/v1/org/attributes/${uuid}`,
            {
                data: {
                    name: newName,
                    users: [
                        {
                            userUuid: SEED_ORG_1_ADMIN.user_uuid,
                            value: 'User Value',
                        },
                    ],
                    groups: [
                        {
                            groupUuid: SEED_GROUP.groupUuid,
                            value: 'Group Value',
                        },
                    ],
                    attributeDefault: null,
                },
            },
        );

        const putBody = await putResponse.json();
        expect(putBody.results.name).toBe(newName);
        expect(putBody.results.users).toHaveLength(1);
        expect(putBody.results.users[0].userUuid).toBe(
            SEED_ORG_1_ADMIN.user_uuid,
        );
        expect(putBody.results.users[0].value).toBe('User Value');
        expect(putBody.results.groups).toHaveLength(1);
        expect(putBody.results.groups[0].groupUuid).toBe(SEED_GROUP.groupUuid);
        expect(putBody.results.groups[0].value).toBe('Group Value');

        await request.delete(`/api/v1/org/attributes/${uuid}`);
    });
});
