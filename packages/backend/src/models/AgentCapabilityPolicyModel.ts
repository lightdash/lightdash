import {
    OrganizationMemberRole,
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
        return {
            mode: policy?.mode ?? 'legacy',
            version: policy?.version ?? 0,
            allowedProjectUuids: policy?.allowed_project_uuids ?? null,
            systemRoleMatrix,
        };
    }

    async save({
        organizationUuid,
        mode,
        allowedProjectUuids,
        systemRoleMatrix,
        updatedByUserUuid,
    }: AgentCapabilityPolicySave): Promise<AgentCapabilityPolicy> {
        return this.database.transaction(async (transaction) => {
            const [policy] = await transaction(AgentCapabilityPoliciesTableName)
                .insert({
                    organization_uuid: organizationUuid,
                    mode,
                    version: 1,
                    allowed_project_uuids: allowedProjectUuids,
                    updated_by_user_uuid: updatedByUserUuid,
                })
                .onConflict('organization_uuid')
                .merge({
                    mode,
                    allowed_project_uuids: allowedProjectUuids,
                    updated_by_user_uuid: updatedByUserUuid,
                    updated_at: transaction.fn.now(),
                    version: transaction.raw('??.?? + 1', [
                        AgentCapabilityPoliciesTableName,
                        'version',
                    ]),
                })
                .returning('*');
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
                systemRoleMatrix,
            };
        });
    }
}
