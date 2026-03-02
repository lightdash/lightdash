import { SEED_GROUP, SEED_ORG_1_ADMIN } from '@lightdash/common';
import type { Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

describe('Attributes API', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    it('creates an attribute with users and groups', async () => {
        const name = `example_attribute${Math.random()}`;

        const createBody = {
            name,
            users: [
                {
                    userUuid: SEED_ORG_1_ADMIN.user_uuid,
                    value: 'User Value',
                },
            ],
            groups: [{ groupUuid: SEED_GROUP.groupUuid, value: 'Group Value' }],
            attributeDefault: null,
        };

        const response = await admin.post<Body<{ uuid: string }>>(
            '/api/v1/org/attributes',
            createBody,
        );
        expect(response.status).toBe(201);

        const { uuid } = response.body.results;

        try {
            const getResponse = await admin.get<
                Body<
                    Array<{
                        uuid: string;
                        name: string;
                        users: Array<{ userUuid: string; value: string }>;
                        groups: Array<{ groupUuid: string; value: string }>;
                    }>
                >
            >('/api/v1/org/attributes');
            const attribute = getResponse.body.results.find(
                (a) => a.uuid === uuid,
            );

            expect(attribute!.name).toBe(name);
            expect(attribute!.users).toHaveLength(1);
            expect(attribute!.users[0].userUuid).toBe(
                SEED_ORG_1_ADMIN.user_uuid,
            );
            expect(attribute!.users[0].value).toBe('User Value');
            expect(attribute!.groups).toHaveLength(1);
            expect(attribute!.groups[0].groupUuid).toBe(SEED_GROUP.groupUuid);
            expect(attribute!.groups[0].value).toBe('Group Value');
        } finally {
            await admin.delete(`/api/v1/org/attributes/${uuid}`);
        }
    });

    it('creates an empty attribute and updates with users and groups', async () => {
        const name = `example_attribute${Math.random()}`;
        const newName = `example_attribute${Math.random()}`;

        const response = await admin.post<
            Body<{
                uuid: string;
                users: Array<{ userUuid: string; value: string }>;
                groups: Array<{ groupUuid: string; value: string }>;
            }>
        >('/api/v1/org/attributes', {
            name,
            users: [],
            groups: [],
            attributeDefault: null,
        });
        expect(response.status).toBe(201);
        expect(response.body.results.users).toHaveLength(0);
        expect(response.body.results.groups).toHaveLength(0);

        const { uuid } = response.body.results;

        try {
            const patchResponse = await admin.put<
                Body<{
                    name: string;
                    users: Array<{ userUuid: string; value: string }>;
                    groups: Array<{ groupUuid: string; value: string }>;
                }>
            >(`/api/v1/org/attributes/${uuid}`, {
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
            });

            expect(patchResponse.body.results.name).toBe(newName);
            expect(patchResponse.body.results.users).toHaveLength(1);
            expect(patchResponse.body.results.users[0].userUuid).toBe(
                SEED_ORG_1_ADMIN.user_uuid,
            );
            expect(patchResponse.body.results.users[0].value).toBe(
                'User Value',
            );
            expect(patchResponse.body.results.groups).toHaveLength(1);
            expect(patchResponse.body.results.groups[0].groupUuid).toBe(
                SEED_GROUP.groupUuid,
            );
            expect(patchResponse.body.results.groups[0].value).toBe(
                'Group Value',
            );
        } finally {
            await admin.delete(`/api/v1/org/attributes/${uuid}`);
        }
    });
});
