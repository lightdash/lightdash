import {
    AGENT_CAPABILITY_LIMIT_DEFAULTS,
    OrganizationMemberRole,
    ParameterError,
    type AgentCapability,
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
import { OrganizationTableName } from '../database/entities/organizations';

const emptyMatrix = (): AgentSystemRoleMatrix => ({
    [OrganizationMemberRole.MEMBER]: [],
    [OrganizationMemberRole.VIEWER]: [],
    [OrganizationMemberRole.INTERACTIVE_VIEWER]: [],
    [OrganizationMemberRole.EDITOR]: [],
    [OrganizationMemberRole.DEVELOPER]: [],
    [OrganizationMemberRole.ADMIN]: [],
});

interface PolicyWithCapability extends Pick<
    DbAgentCapabilityPolicy,
    'mode' | 'version' | 'allowed_capabilities' | 'allowed_group_uuids'
> {
    system_role: DbAgentSystemRoleCapability['system_role'] | null;
    capability: DbAgentSystemRoleCapability['capability'] | null;
}

export interface AgentEnforcementPolicy {
    mode: 'legacy' | 'managed';
    version: number;
    allowedCapabilities: AgentCapability[] | null;
    storedAllowedGroupUuids: string[] | null;
    hasExistingAllowedGroup: boolean | null;
    systemRoleMatrix: AgentSystemRoleMatrix;
}

export class AgentCapabilityPolicyModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
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
                `${AgentCapabilityPoliciesTableName}.mode`,
                `${AgentCapabilityPoliciesTableName}.version`,
                `${AgentCapabilityPoliciesTableName}.allowed_capabilities`,
                `${AgentCapabilityPoliciesTableName}.allowed_group_uuids`,
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
            allowedCapabilities: policy?.allowed_capabilities ?? null,
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
                `${AgentCapabilityPoliciesTableName}.mode`,
                `${AgentCapabilityPoliciesTableName}.version`,
                `${AgentCapabilityPoliciesTableName}.allowed_capabilities`,
                `${AgentCapabilityPoliciesTableName}.allowed_group_uuids`,
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
        return {
            mode: policy?.mode ?? 'legacy',
            version: policy?.version ?? 0,
            allowedCapabilities: policy?.allowed_capabilities ?? null,
            storedAllowedGroupUuids: policy?.allowed_group_uuids ?? null,
            hasExistingAllowedGroup: policy?.has_existing_allowed_group ?? null,
            systemRoleMatrix,
        };
    }

    async save({
        organizationUuid,
        mode,
        version,
        allowedCapabilities,
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
            const normalizedCapabilities =
                mode === 'legacy'
                    ? null
                    : AGENT_CAPABILITY_LIMIT_DEFAULTS.filter(
                          (capability) =>
                              allowedCapabilities === undefined ||
                              allowedCapabilities?.includes(capability),
                      );
            const query = transaction(AgentCapabilityPoliciesTableName)
                .insert({
                    organization_uuid: organizationUuid,
                    mode,
                    version: 1,
                    allowed_capabilities: normalizedCapabilities,
                    allowed_project_uuids: null,
                    allowed_user_uuids: null,
                    allowed_group_uuids: allowedGroupUuids ?? null,
                    updated_by_user_uuid: updatedByUserUuid,
                })
                .onConflict('organization_uuid')
                .merge({
                    mode,
                    allowed_capabilities:
                        mode === 'managed' && allowedCapabilities === undefined
                            ? transaction.raw('COALESCE(??.??, ?::text[])', [
                                  AgentCapabilityPoliciesTableName,
                                  'allowed_capabilities',
                                  [...AGENT_CAPABILITY_LIMIT_DEFAULTS],
                              ])
                            : normalizedCapabilities,
                    allowed_project_uuids: null,
                    allowed_user_uuids: null,
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
            const normalizedMatrix = emptyMatrix();
            for (const role of Object.values(OrganizationMemberRole)) {
                normalizedMatrix[role] = AGENT_CAPABILITY_LIMIT_DEFAULTS.filter(
                    (capability) =>
                        systemRoleMatrix[role].includes(capability) &&
                        policy.allowed_capabilities?.includes(capability),
                );
            }
            const grants = Object.values(OrganizationMemberRole).flatMap(
                (role) =>
                    normalizedMatrix[role].map((capability) => ({
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
                allowedCapabilities: policy.allowed_capabilities,
                allowedGroupUuids: policy.allowed_group_uuids,
                systemRoleMatrix: normalizedMatrix,
            };
        });
    }
}
