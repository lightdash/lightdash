import { AgentCapability } from '@lightdash/common';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

const TABLE = 'organization_agent_capability_policies';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

test('the mode column is gone and policies still save and read', async () => {
    await migrated.database.transaction(async (trx) => {
        expect(
            await trx('information_schema.columns').where({
                table_name: TABLE,
                column_name: 'mode',
            }),
        ).toEqual([]);
        const [org] = await trx('organizations')
            .insert({ organization_name: 'Agent policy without mode' })
            .returning('organization_uuid');
        const model = new AgentCapabilityPolicyModel({ database: trx });
        const saved = await model.save({
            organizationUuid: org.organization_uuid,
            allowedCapabilities: [AgentCapability.Query],
            updatedByUserUuid: null,
        });
        expect(saved.allowedCapabilities).toEqual([AgentCapability.Query]);
        expect(
            (await model.get(org.organization_uuid)).allowedCapabilities,
        ).toEqual([AgentCapability.Query]);
    });
});
