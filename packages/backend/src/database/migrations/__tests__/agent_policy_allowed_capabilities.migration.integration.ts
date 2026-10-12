import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../../services/AgentPermissionService/AgentPermissionService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261011000005_add_agent_policy_allowed_capabilities';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

test('adds a nullable text array without a default to existing policies and reverses it', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        const [org] = await trx('organizations')
            .insert({ organization_name: 'Admission migration' })
            .returning('organization_uuid');
        await trx('organization_agent_capability_policies').insert({
            organization_uuid: org.organization_uuid,
            mode: 'managed',
            allowed_user_uuids: ['00000000-0000-0000-0000-000000000001'],
            allowed_project_uuids: ['00000000-0000-0000-0000-000000000002'],
        } as never);
        await up(trx);
        const column = await trx('information_schema.columns')
            .where({
                table_name: 'organization_agent_capability_policies',
                column_name: 'allowed_capabilities',
            })
            .first();
        expect(column).toMatchObject({
            is_nullable: 'YES',
            data_type: 'ARRAY',
            udt_name: '_text',
            column_default: null,
        });
        const policy = await trx('organization_agent_capability_policies')
            .where('organization_uuid', org.organization_uuid)
            .first();
        expect(policy?.allowed_capabilities).toBeNull();
        expect(policy?.allowed_user_uuids).toEqual([
            '00000000-0000-0000-0000-000000000001',
        ]);
        expect(policy?.allowed_project_uuids).toEqual([
            '00000000-0000-0000-0000-000000000002',
        ]);
        await trx('organization_agent_capability_policies')
            .where('organization_uuid', org.organization_uuid)
            .update({ allowed_capabilities: [] });
        expect(
            (
                await trx('organization_agent_capability_policies')
                    .where('organization_uuid', org.organization_uuid)
                    .first()
            )?.allowed_capabilities,
        ).toEqual([]);
        await down(trx);
        expect(
            await trx.schema.hasColumn(
                'organization_agent_capability_policies',
                'allowed_capabilities',
            ),
        ).toBe(false);
        await up(trx);
    });
});

test('a historical null list preserves custom grants until a save narrows them', async () => {
    await migrated.database.transaction(async (trx) => {
        const [org] = await trx('organizations')
            .insert({ organization_name: 'Capability list contract' })
            .returning('organization_uuid');
        await trx('organization_agent_capability_policies').insert({
            organization_uuid: org.organization_uuid,
            mode: 'managed',
            version: 1,
            allowed_capabilities: null,
            allowed_group_uuids: null,
            allowed_user_uuids: ['00000000-0000-0000-0000-000000000001'],
            allowed_project_uuids: [],
            updated_by_user_uuid: null,
        });
        const model = new AgentCapabilityPolicyModel({ database: trx });
        const account = buildAccount();
        account.organization.organizationUuid = org.organization_uuid;
        const roles = {
            systemRoles: [],
            customRoles: [{ roleUuid: 'custom', scopes: ['view:AgentDelete'] }],
        };
        const service = new AgentPermissionService({
            agentCapabilityPolicyModel: model,
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            },
            groupsModel: { findUserInGroups: vi.fn() },
            userModel: {
                getAgentRoleAssignments: vi.fn().mockResolvedValue(roles),
            },
            projectModel: { getSummary: vi.fn() },
            resolveResourceProjectUuid: vi.fn(),
            areGroupsAvailable: vi.fn(),
            isCustomRolesLicensed: () => false,
            agentActionLogModel: { insert: vi.fn() },
        });
        const operation = {
            account,
            organizationUuid: org.organization_uuid,
            projectUuid: null,
            kind: 'capability' as const,
            key: AgentCapability.Delete,
            surface: AgentActorSurface.IN_APP_AGENT,
        };
        await expect(
            service.assertOperation(operation),
        ).resolves.toBeUndefined();
        expect(
            (await model.get(org.organization_uuid)).allowedCapabilities,
        ).toBeNull();
        const first = await model.save({
            organizationUuid: org.organization_uuid,
            mode: 'managed',
            version: 1,
            systemRoleMatrix: agentSystemRoleMatrix([]),
            updatedByUserUuid: null,
        });
        expect(first.allowedCapabilities).toEqual(
            Object.values(AgentCapability),
        );
        await expect(
            service.assertOperation(operation),
        ).resolves.toBeUndefined();
        const saved = await model.save({
            organizationUuid: org.organization_uuid,
            mode: 'managed',
            version: first.version,
            allowedCapabilities: [AgentCapability.Query, AgentCapability.Query],
            systemRoleMatrix: agentSystemRoleMatrix([
                AgentCapability.Query,
                AgentCapability.Delete,
            ]),
            updatedByUserUuid: null,
        });
        expect(saved.allowedCapabilities).toEqual([AgentCapability.Query]);
        expect(saved.systemRoleMatrix).toEqual(
            agentSystemRoleMatrix([AgentCapability.Query]),
        );
        expect(
            await model.getForEnforcement(org.organization_uuid),
        ).toMatchObject({ allowedCapabilities: [AgentCapability.Query] });
        expect(roles.customRoles[0].scopes).toContain('view:AgentDelete');
        await expect(service.assertOperation(operation)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                policyLayer: 'organization_setting',
            },
        });
        const oldTab = await model.save({
            organizationUuid: org.organization_uuid,
            mode: 'managed',
            version: saved.version,
            systemRoleMatrix: agentSystemRoleMatrix(
                Object.values(AgentCapability),
            ),
            updatedByUserUuid: null,
        });
        expect(oldTab.allowedCapabilities).toEqual([AgentCapability.Query]);
        expect(oldTab.systemRoleMatrix).toEqual(
            agentSystemRoleMatrix([AgentCapability.Query]),
        );
        const row = await trx('organization_agent_capability_policies')
            .where('organization_uuid', org.organization_uuid)
            .first();
        expect(row).toMatchObject({
            allowed_user_uuids: null,
            allowed_project_uuids: null,
        });
    });
});
