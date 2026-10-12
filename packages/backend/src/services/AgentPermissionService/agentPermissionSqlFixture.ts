import {
    AgentActorSurface,
    AgentCapability,
    assertIsAccountWithOrg,
    OrganizationMemberRole,
    type AgentCapabilityPolicy,
    type RegisteredAccount,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { type Tracker } from 'knex-mock-client';
import { buildAccount } from '../../auth/account/account.mock';
import { AgentCapabilityPolicyModel } from '../../models/AgentCapabilityPolicyModel';
import { GroupsModel } from '../../models/GroupsModel';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from './AgentPermissionService';

export const setupPermissionSql = (
    database: Knex,
    tracker: Tracker,
    account: RegisteredAccount = buildAccount(),
) => {
    assertIsAccountWithOrg(account);
    const policy: AgentCapabilityPolicy = {
        mode: 'legacy',
        version: 7,
        allowedCapabilities: null,
        allowedGroupUuids: ['live'],
        systemRoleMatrix: agentSystemRoleMatrix(Object.values(AgentCapability)),
    };
    const state = {
        policy,
        existingGroups: ['live'],
        members: [account.user.id],
        allowedUserUuids: ['excluded-person'] as string[] | null,
        allowedProjectUuids: ['excluded-project'],
        missing: false,
    };
    tracker.on
        .select((query) =>
            query.sql.includes('from "organization_agent_capability_policies"'),
        )
        .response(() =>
            state.missing
                ? []
                : Object.entries(policy.systemRoleMatrix).flatMap(
                      ([role, capabilities]) =>
                          (capabilities.length ? capabilities : [null]).map(
                              (capability) => ({
                                  mode: policy.mode,
                                  allowed_capabilities:
                                      policy.allowedCapabilities,
                                  version: policy.version,
                                  allowed_project_uuids:
                                      state.allowedProjectUuids,
                                  allowed_user_uuids: state.allowedUserUuids,
                                  allowed_group_uuids: policy.allowedGroupUuids,
                                  has_existing_allowed_group:
                                      policy.allowedGroupUuids === null
                                          ? null
                                          : policy.allowedGroupUuids.some(
                                                (uuid) =>
                                                    state.existingGroups.includes(
                                                        uuid,
                                                    ),
                                            ),
                                  system_role: role,
                                  capability,
                              }),
                          ),
                  ),
        );
    tracker.on
        .select((query) => query.sql.includes('from "groups"'))
        .response(() =>
            state.existingGroups.map((group_uuid) => ({ group_uuid })),
        );
    tracker.on
        .select((query) => query.sql.includes('from "group_memberships"'))
        .response((query) =>
            state.members
                .filter((uuid) => query.bindings.includes(uuid))
                .map((user_uuid) => ({ user_uuid, group_uuid: 'live' })),
        );
    const deps = {
        agentCapabilityPolicyModel: new AgentCapabilityPolicyModel({
            database,
        }),
        groupsModel: new GroupsModel({ database }),
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        areGroupsAvailable: vi.fn().mockResolvedValue(false),
        isCustomRolesLicensed: () => false,
        userModel: {
            getAgentRoleAssignments: vi.fn().mockResolvedValue({
                systemRoles: [OrganizationMemberRole.VIEWER],
                customRoles: [],
            }),
        },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: account.organization.organizationUuid,
            }),
        },

        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
    };
    const service = new AgentPermissionService(deps);
    const operation = {
        account,
        organizationUuid: account.organization.organizationUuid,
        projectUuid: 'project',
        kind: 'rest_operation' as const,
        key: 'SqlRunnerController.runSql',
        surface: AgentActorSurface.MCP,
    };
    return { state, deps, service, operation };
};

export const expectAdmissionSql = (
    tracker: Tracker,
    counts: {
        policy: number;
        groups: number;
        people: number;
        membership: number;
    },
) => {
    const queries = tracker.history.select;
    expect(queries).toHaveLength(
        Object.values(counts).reduce((sum, n) => sum + n, 0),
    );
    for (const [kind, table] of Object.entries({
        policy: 'organization_agent_capability_policies',
        groups: 'groups',
        people: 'organization_memberships',
        membership: 'group_memberships',
    })) {
        expect(
            queries.filter((query) => query.sql.includes(`from "${table}"`)),
        ).toHaveLength(counts[kind as keyof typeof counts]);
    }
    for (const query of queries.filter((q) =>
        q.sql.includes('from "group_memberships"'),
    )) {
        expect(query.sql).toContain('for share');
        expect(query.sql).toContain('"group_memberships"."group_uuid" in');
    }
};
