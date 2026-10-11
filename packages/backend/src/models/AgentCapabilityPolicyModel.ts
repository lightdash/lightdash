import {
    OrganizationMemberRole,
    ParameterError,
    type AgentCapabilityPolicy,
    type AgentCapabilityPolicySave,
    type AgentSystemRoleMatrix,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AgentCapabilityPoliciesTableName,
    AgentSystemRoleCapabilitiesTableName,
    type DbAgentCapabilityPolicy,
    type DbAgentSystemRoleCapability,
} from '../database/entities/agentCapabilityPolicies';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';

const emptyMatrix = (): AgentSystemRoleMatrix => ({
    [OrganizationMemberRole.MEMBER]: [],
    [OrganizationMemberRole.VIEWER]: [],
    [OrganizationMemberRole.INTERACTIVE_VIEWER]: [],
    [OrganizationMemberRole.EDITOR]: [],
    [OrganizationMemberRole.DEVELOPER]: [],
    [OrganizationMemberRole.ADMIN]: [],
});

interface PolicyWithCapability extends DbAgentCapabilityPolicy {
    system_role: DbAgentSystemRoleCapability['system_role'] | null;
    capability: DbAgentSystemRoleCapability['capability'] | null;
}

export interface AgentEnforcementPolicy {
    mode: 'legacy' | 'managed';
    version: number;
    allowedProjectUuids: string[] | null;
    allowedUserUuids: string[] | null;
    storedAllowedGroupUuids: string[] | null;
    hasExistingAllowedGroup: boolean | null;
    systemRoleMatrix: AgentSystemRoleMatrix;
}

export class AgentCapabilityPolicyModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private getAllowedMembers(
        database: Knex,
        organizationUuid: string,
        allowedUserUuids: string[],
    ) {
        return database(OrganizationMembershipsTableName)
            .join('users', 'users.user_id', 'organization_memberships.user_id')
            .join(
                'organizations',
                'organizations.organization_id',
                'organization_memberships.organization_id',
            )
            .where('organizations.organization_uuid', organizationUuid)
            .whereIn('users.user_uuid', allowedUserUuids)
            .select('users.user_uuid');
    }

    private getAllowedGroups(
        database: Knex,
        organizationUuid: string,
        groupUuids: string[],
    ) {
        return database(GroupTableName)
            .join(
                'organizations',
                'organizations.organization_id',
                'groups.organization_id',
            )
            .where('organizations.organization_uuid', organizationUuid)
            .whereIn('groups.group_uuid', groupUuids)
            .select('groups.group_uuid');
    }

    async get(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<AgentCapabilityPolicy> {
        const rows = await database(AgentCapabilityPoliciesTableName)
            .leftJoin(
                AgentSystemRoleCapabilitiesTableName,
                `${AgentCapabilityPoliciesTableName}.organization_uuid`,
                `${AgentSystemRoleCapabilitiesTableName}.organization_uuid`,
            )
            .where(
                `${AgentCapabilityPoliciesTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<PolicyWithCapability[]>(
                `${AgentCapabilityPoliciesTableName}.*`,
                `${AgentSystemRoleCapabilitiesTableName}.system_role`,
                `${AgentSystemRoleCapabilitiesTableName}.capability`,
            );
        const systemRoleMatrix = emptyMatrix();
        const [policy] = rows;
        for (const row of rows) {
            if (row.system_role && row.capability) {
                systemRoleMatrix[row.system_role].push(row.capability);
            }
        }
        const storedUsers = policy?.allowed_user_uuids ?? null;
        const members = storedUsers?.length
            ? await this.getAllowedMembers(
                  database,
                  organizationUuid,
                  storedUsers,
              )
            : [];
        const memberUuids = new Set(members.map((member) => member.user_uuid));
        const storedGroups = policy?.allowed_group_uuids ?? null;
        const groups = storedGroups?.length
            ? await this.getAllowedGroups(
                  database,
                  organizationUuid,
                  storedGroups,
              )
            : [];
        const groupUuids = new Set(groups.map((group) => group.group_uuid));
        return {
            allowedGroupUuids:
                storedGroups?.filter((uuid) => groupUuids.has(uuid)) ?? null,
            mode: policy?.mode ?? 'legacy',
            version: policy?.version ?? 0,
            allowedProjectUuids: policy?.allowed_project_uuids ?? null,
            allowedUserUuids:
                storedUsers?.filter((uuid) => memberUuids.has(uuid)) ?? null,
            systemRoleMatrix,
        };
    }

    async getForEnforcement(
        organizationUuid: string,
    ): Promise<AgentEnforcementPolicy> {
        const rows = await this.database(AgentCapabilityPoliciesTableName)
            .leftJoin(
                AgentSystemRoleCapabilitiesTableName,
                `${AgentCapabilityPoliciesTableName}.organization_uuid`,
                `${AgentSystemRoleCapabilitiesTableName}.organization_uuid`,
            )
            .where(
                `${AgentCapabilityPoliciesTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<
                (PolicyWithCapability & {
                    has_existing_allowed_group: boolean | null;
                })[]
            >(
                `${AgentCapabilityPoliciesTableName}.*`,
                `${AgentSystemRoleCapabilitiesTableName}.system_role`,
                `${AgentSystemRoleCapabilitiesTableName}.capability`,
                this.database.raw(
                    `CASE WHEN ?? IS NULL THEN NULL ELSE EXISTS (
                        SELECT 1 FROM ?? JOIN ?? ON ?? = ??
                        WHERE ?? = ?? AND ?? = ANY(??)
                    ) END AS ??`,
                    [
                        `${AgentCapabilityPoliciesTableName}.allowed_group_uuids`,
                        GroupTableName,
                        OrganizationTableName,
                        `${OrganizationTableName}.organization_id`,
                        `${GroupTableName}.organization_id`,
                        `${OrganizationTableName}.organization_uuid`,
                        `${AgentCapabilityPoliciesTableName}.organization_uuid`,
                        `${GroupTableName}.group_uuid`,
                        `${AgentCapabilityPoliciesTableName}.allowed_group_uuids`,
                        'has_existing_allowed_group',
                    ],
                ),
            );
        const systemRoleMatrix = emptyMatrix();
        const [policy] = rows;
        for (const row of rows) {
            if (row.system_role && row.capability) {
                systemRoleMatrix[row.system_role].push(row.capability);
            }
        }
        const storedUsers = policy?.allowed_user_uuids ?? null;
        const members = storedUsers?.length
            ? await this.getAllowedMembers(
                  this.database,
                  organizationUuid,
                  storedUsers,
              )
            : [];
        const memberUuids = new Set(members.map((member) => member.user_uuid));
        return {
            mode: policy?.mode ?? 'legacy',
            version: policy?.version ?? 0,
            allowedProjectUuids: policy?.allowed_project_uuids ?? null,
            allowedUserUuids:
                storedUsers?.filter((uuid) => memberUuids.has(uuid)) ?? null,
            storedAllowedGroupUuids: policy?.allowed_group_uuids ?? null,
            hasExistingAllowedGroup: policy?.has_existing_allowed_group ?? null,
            systemRoleMatrix,
        };
    }

    async save({
        organizationUuid,
        mode,
        version,
        allowedProjectUuids,
        allowedUserUuids,
        allowedGroupUuids,
        systemRoleMatrix,
        updatedByUserUuid,
    }: AgentCapabilityPolicySave): Promise<AgentCapabilityPolicy> {
        return this.database.transaction(async (transaction) => {
            if (allowedGroupUuids !== undefined && allowedGroupUuids !== null) {
                if (allowedGroupUuids.length === 0)
                    throw new ParameterError(
                        'Choose at least one group, or allow everyone.',
                    );
                const groups = await this.getAllowedGroups(
                    transaction,
                    organizationUuid,
                    allowedGroupUuids,
                );
                const groupUuids = new Set(
                    groups.map((group) => group.group_uuid),
                );
                if (allowedGroupUuids.some((uuid) => !groupUuids.has(uuid)))
                    throw new ParameterError(
                        'All allowed groups must belong to this organization',
                    );
            }
            if (
                mode === 'managed' &&
                allowedUserUuids !== undefined &&
                allowedUserUuids !== null &&
                allowedUserUuids.length > 0
            ) {
                const members = await this.getAllowedMembers(
                    transaction,
                    organizationUuid,
                    allowedUserUuids,
                );
                const memberUuids = new Set(
                    members.map((member) => member.user_uuid),
                );
                if (
                    allowedUserUuids.some(
                        (userUuid) => !memberUuids.has(userUuid),
                    )
                ) {
                    throw new ParameterError(
                        'All allowed users must belong to this organization',
                    );
                }
            }
            const query = transaction(AgentCapabilityPoliciesTableName)
                .insert({
                    organization_uuid: organizationUuid,
                    mode,
                    version: 1,
                    allowed_project_uuids:
                        mode === 'managed' ? allowedProjectUuids : null,
                    allowed_user_uuids:
                        mode === 'managed' ? (allowedUserUuids ?? null) : null,
                    allowed_group_uuids: allowedGroupUuids ?? null,
                    updated_by_user_uuid: updatedByUserUuid,
                })
                .onConflict('organization_uuid')
                .merge({
                    mode,
                    ...(mode === 'managed' && {
                        allowed_project_uuids: allowedProjectUuids,
                        ...(allowedUserUuids !== undefined && {
                            allowed_user_uuids: allowedUserUuids,
                        }),
                    }),
                    ...(allowedGroupUuids !== undefined && {
                        allowed_group_uuids: allowedGroupUuids,
                    }),
                    updated_by_user_uuid: updatedByUserUuid,
                    updated_at: transaction.fn.now(),
                    version: transaction.raw('??.?? + 1', [
                        AgentCapabilityPoliciesTableName,
                        'version',
                    ]),
                })
                .returning('*');
            if (version !== undefined) {
                query.where(
                    `${AgentCapabilityPoliciesTableName}.version`,
                    version,
                );
            }
            const [policy] = await query;
            if (
                !policy ||
                (version !== undefined && policy.version !== version + 1)
            ) {
                throw new ParameterError(
                    'Agent permissions changed. Reload the latest permissions before saving.',
                );
            }
            if (mode === 'legacy')
                return this.get(organizationUuid, transaction);
            await transaction(AgentSystemRoleCapabilitiesTableName)
                .where('organization_uuid', organizationUuid)
                .delete();
            const grants = Object.values(OrganizationMemberRole).flatMap(
                (role) =>
                    [...new Set(systemRoleMatrix[role])].map((capability) => ({
                        organization_uuid: organizationUuid,
                        system_role: role,
                        capability,
                    })),
            );
            if (grants.length > 0) {
                await transaction(AgentSystemRoleCapabilitiesTableName).insert(
                    grants,
                );
            }
            return {
                mode: policy.mode,
                version: policy.version,
                allowedProjectUuids: policy.allowed_project_uuids,
                allowedUserUuids: policy.allowed_user_uuids,
                allowedGroupUuids: policy.allowed_group_uuids,
                systemRoleMatrix,
            };
        });
    }
}
