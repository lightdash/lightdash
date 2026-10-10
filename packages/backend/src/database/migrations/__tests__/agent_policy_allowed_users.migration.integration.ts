import { OrganizationMemberRole, ParameterError } from '@lightdash/common';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261011000001_add_agent_policy_allowed_users';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

test('adds a nullable UUID array to existing policies and reverses it', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        const [org] = await trx('organizations')
            .insert({ organization_name: 'Admission migration' })
            .returning('organization_uuid');
        await trx('organization_agent_capability_policies').insert({
            organization_uuid: org.organization_uuid,
        } as never);
        await up(trx);
        const policy = await trx('organization_agent_capability_policies')
            .where('organization_uuid', org.organization_uuid)
            .first();
        expect(policy?.allowed_user_uuids).toBeNull();
        await trx('organization_agent_capability_policies')
            .where('organization_uuid', org.organization_uuid)
            .update({ allowed_user_uuids: [] });
        expect(
            (
                await trx('organization_agent_capability_policies')
                    .where('organization_uuid', org.organization_uuid)
                    .first()
            )?.allowed_user_uuids,
        ).toEqual([]);
        await down(trx);
        expect(
            await trx.schema.hasColumn(
                'organization_agent_capability_policies',
                'allowed_user_uuids',
            ),
        ).toBe(false);
        await up(trx);
    });
});

test('validates members against the policy organization and round-trips admission states', async () => {
    const organizations = await migrated
        .database('organizations')
        .insert([
            { organization_name: 'Admission org' },
            { organization_name: 'Other org' },
        ])
        .returning(['organization_uuid', 'organization_id']);
    const users = await migrated
        .database('users')
        .insert([
            { first_name: 'Allowed', last_name: 'Member' },
            { first_name: 'Other', last_name: 'Member' },
        ] as never)
        .returning(['user_uuid', 'user_id']);
    await migrated.database('organization_memberships').insert(
        organizations.map((org, index) => ({
            organization_id: org.organization_id,
            user_id: users[index].user_id,
            role: OrganizationMemberRole.VIEWER,
        })),
    );
    const model = new AgentCapabilityPolicyModel({
        database: migrated.database,
    });
    const save = (allowedUserUuids: string[] | null) =>
        model.save({
            organizationUuid: organizations[0].organization_uuid,
            mode: 'managed',
            allowedProjectUuids: null,
            allowedUserUuids,
            systemRoleMatrix: {
                member: [],
                viewer: [],
                interactive_viewer: [],
                editor: [],
                developer: [],
                admin: [],
            },
            updatedByUserUuid: null,
        });
    await [null, [], [users[0].user_uuid]].reduce<Promise<void>>(
        async (previous, allowedUserUuids) => {
            await previous;
            const policy = await save(allowedUserUuids);
            expect(policy.allowedUserUuids).toEqual(allowedUserUuids);
            expect(await model.get(organizations[0].organization_uuid)).toEqual(
                policy,
            );
        },
        Promise.resolve(),
    );
    await expect(save([users[1].user_uuid])).rejects.toBeInstanceOf(
        ParameterError,
    );
    await expect(
        save(['00000000-0000-0000-0000-000000000000']),
    ).rejects.toBeInstanceOf(ParameterError);
});
