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
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';

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

    async get(organizationUuid: string): Promise<AgentCapabilityPolicy> {
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
            systemRoleMatrix,
        };
    }

    async save({
        organizationUuid,
        mode,
        version,
        allowedProjectUuids,
        allowedUserUuids,
        systemRoleMatrix,
        updatedByUserUuid,
    }: AgentCapabilityPolicySave): Promise<AgentCapabilityPolicy> {
        return this.database.transaction(async (transaction) => {
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
                    allowed_project_uuids: allowedProjectUuids,
                    allowed_user_uuids: allowedUserUuids ?? null,
                    updated_by_user_uuid: updatedByUserUuid,
                })
                .onConflict('organization_uuid')
                .merge({
                    mode,
                    allowed_project_uuids: allowedProjectUuids,
                    ...(allowedUserUuids !== undefined && {
                        allowed_user_uuids: allowedUserUuids,
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
                systemRoleMatrix,
            };
        });
    }
}
