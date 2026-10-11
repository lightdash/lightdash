import {
    AgentActorSurface,
    AiAccessRefusalReason,
    OrganizationMemberRole,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import { GroupsModel } from '../../../models/GroupsModel';
import { AgentPermissionService } from '../../../services/AgentPermissionService/AgentPermissionService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

test.each([
    'deleted group',
    'foreign group',
    'departed person',
    'null list',
    'empty list',
    'live member',
    'live non-member',
] as const)('enforcement on the real schema: %s', async (scenario) => {
    const trx = await migrated.database.transaction();
    try {
        const organizations = await trx('organizations')
            .insert([
                { organization_name: 'Enforcement test' },
                { organization_name: 'Other enforcement test' },
            ])
            .returning('*');
        const [organization, otherOrganization] = organizations;
        const [user] = await trx('users')
            .insert({
                first_name: 'Enforcement',
                last_name: 'Member',
                is_marketing_opted_in: false,
                is_tracking_anonymized: true,
                is_setup_complete: true,
                is_active: true,
            })
            .returning('*');
        await trx('organization_memberships').insert(
            organizations.map((org) => ({
                organization_id: org.organization_id,
                user_id: user.user_id,
                role: OrganizationMemberRole.VIEWER,
            })),
        );
        const groups = await trx('groups')
            .insert(
                organizations.map((org) => ({
                    organization_id: org.organization_id,
                    name: 'Allowed group',
                    created_by_user_uuid: null,
                    updated_by_user_uuid: null,
                })),
            )
            .returning('*');
        const [group, foreignGroup] = groups;
        await trx('group_memberships').insert(
            groups
                .filter(
                    (entry) =>
                        scenario !== 'live non-member' ||
                        entry.organization_id ===
                            otherOrganization.organization_id,
                )
                .map((entry) => ({
                    group_uuid: entry.group_uuid,
                    organization_id: entry.organization_id,
                    user_id: user.user_id,
                })),
        );
        let storedGroups: string[] | null = [
            scenario === 'foreign group'
                ? foreignGroup.group_uuid
                : group.group_uuid,
        ];
        if (scenario === 'null list') storedGroups = null;
        else if (scenario === 'empty list') storedGroups = [];
        await trx('organization_agent_capability_policies').insert({
            organization_uuid: organization.organization_uuid,
            mode: 'legacy',
            allowed_project_uuids: null,
            allowed_user_uuids: [user.user_uuid, user.user_uuid],
            allowed_group_uuids: storedGroups,
            version: 1,
            updated_by_user_uuid: null,
        });
        if (scenario === 'deleted group') {
            await trx('groups').where('group_uuid', group.group_uuid).delete();
            expect(
                await trx('group_memberships').where(
                    'group_uuid',
                    group.group_uuid,
                ),
            ).toEqual([]);
        }
        if (scenario === 'departed person') {
            await trx('organization_memberships')
                .where({
                    organization_id: organization.organization_id,
                    user_id: user.user_id,
                })
                .delete();
            expect(
                await trx('group_memberships').where({
                    organization_id: organization.organization_id,
                    user_id: user.user_id,
                }),
            ).toEqual([]);
        }
        const policyModel = new AgentCapabilityPolicyModel({ database: trx });
        const policy = await policyModel.getForEnforcement(
            organization.organization_uuid,
        );
        expect(policy.storedAllowedGroupUuids).toEqual(storedGroups);
        expect(policy.hasExistingAllowedGroup).toBe(
            scenario === 'null list'
                ? null
                : !['empty list', 'deleted group', 'foreign group'].includes(
                      scenario,
                  ),
        );
        expect(policy.allowedUserUuids).toEqual(
            scenario === 'departed person'
                ? []
                : [user.user_uuid, user.user_uuid],
        );
        const account = buildAccount();
        account.organization.organizationUuid = organization.organization_uuid;
        account.user.id = user.user_uuid;
        const insert = vi.fn().mockResolvedValue(undefined);
        const service = new AgentPermissionService({
            agentCapabilityPolicyModel: policyModel,
            groupsModel: new GroupsModel({ database: trx }),
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            },
            resolveResourceProjectUuid: vi.fn(),
            isCustomRolesLicensed: () => false,
            areGroupsAvailable: vi.fn().mockResolvedValue(false),
            userModel: { getAgentRoleAssignments: vi.fn() },
            projectModel: { getSummary: vi.fn() },
            getOrganizationSettings: vi.fn(),
            agentActionLogModel: { insert },
        });
        const queries: string[] = [];
        const onQuery = ({ sql }: { sql: string }) => queries.push(sql);
        migrated.database.on('query', onQuery);
        try {
            const operation = service.assertOperation({
                account,
                organizationUuid: organization.organization_uuid,
                projectUuid: null,
                kind: 'agent_turn',
                key: 'agent_turn',
                surface: AgentActorSurface.IN_APP_AGENT,
            });
            if (scenario === 'null list' || scenario === 'live member') {
                await expect(operation).resolves.toBeUndefined();
                expect(insert).not.toHaveBeenCalled();
            } else {
                await expect(operation).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                        policyVersion: 1,
                    },
                });
                expect(insert).toHaveBeenCalledOnce();
            }
        } finally {
            migrated.database.off('query', onQuery);
        }
        const membership = queries.filter((sql) =>
            sql.includes('from "group_memberships"'),
        );
        expect(membership).toHaveLength(
            ['departed person', 'live member', 'live non-member'].includes(
                scenario,
            )
                ? 1
                : 0,
        );
        membership.forEach((sql) => expect(sql).toContain('for share'));
    } finally {
        await trx.rollback();
    }
});
