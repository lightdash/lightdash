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

test('current readers ignore historical people and project restrictions', async () => {
    await migrated.database.transaction(async (trx) => {
        const [org] = await trx('organizations')
            .insert({ organization_name: 'Historical policy' })
            .returning('organization_uuid');
        await trx('organization_agent_capability_policies').insert({
            organization_uuid: org.organization_uuid,
            mode: 'managed',
            version: 1,
            allowed_capabilities: null,
            allowed_group_uuids: null,
            allowed_user_uuids: ['00000000-0000-0000-0000-000000000001'],
            allowed_project_uuids: ['00000000-0000-0000-0000-000000000002'],
            updated_by_user_uuid: null,
        });
        const model = new AgentCapabilityPolicyModel({ database: trx });
        for (const policy of [
            await model.get(org.organization_uuid),
            await model.getForEnforcement(org.organization_uuid),
        ]) {
            expect(policy).not.toHaveProperty('allowedUserUuids');
            expect(policy).not.toHaveProperty('allowedProjectUuids');
            expect(policy.allowedCapabilities).toBeNull();
        }
    });
});
