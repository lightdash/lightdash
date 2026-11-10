import {
    AGENT_CAPABILITY_LIMIT_DEFAULTS,
    ParameterError,
    type AgentCapability,
    type AgentCapabilityPolicy,
    type AgentCapabilityPolicySave,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AgentCapabilityPoliciesTableName,
    type DbAgentCapabilityPolicy,
} from '../database/entities/agentCapabilityPolicies';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationTableName } from '../database/entities/organizations';

type StoredPolicy = Pick<
    DbAgentCapabilityPolicy,
    'mode' | 'version' | 'allowed_capabilities' | 'allowed_group_uuids'
>;

export interface AgentEnforcementPolicy {
    mode: 'legacy' | 'managed';
    version: number;
    allowedCapabilities: AgentCapability[] | null;
    storedAllowedGroupUuids: string[] | null;
    hasExistingAllowedGroup: boolean | null;
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
        const [policy] = await database(AgentCapabilityPoliciesTableName)
            .where(
                `${AgentCapabilityPoliciesTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<StoredPolicy[]>(
                `${AgentCapabilityPoliciesTableName}.mode`,
                `${AgentCapabilityPoliciesTableName}.version`,
                `${AgentCapabilityPoliciesTableName}.allowed_capabilities`,
                `${AgentCapabilityPoliciesTableName}.allowed_group_uuids`,
            );
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
        };
    }

    async getForEnforcement(
        organizationUuid: string,
    ): Promise<AgentEnforcementPolicy> {
        const [policy] = await this.database(AgentCapabilityPoliciesTableName)
            .where(
                `${AgentCapabilityPoliciesTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<
                (StoredPolicy & {
                    has_existing_allowed_group: boolean | null;
                })[]
            >(
                `${AgentCapabilityPoliciesTableName}.mode`,
                `${AgentCapabilityPoliciesTableName}.version`,
                `${AgentCapabilityPoliciesTableName}.allowed_capabilities`,
                `${AgentCapabilityPoliciesTableName}.allowed_group_uuids`,
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
        return {
            mode: policy?.mode ?? 'legacy',
            version: policy?.version ?? 0,
            allowedCapabilities: policy?.allowed_capabilities ?? null,
            storedAllowedGroupUuids: policy?.allowed_group_uuids ?? null,
            hasExistingAllowedGroup: policy?.has_existing_allowed_group ?? null,
        };
    }

    async save({
        organizationUuid,
        mode,
        version,
        allowedCapabilities,
        allowedGroupUuids,
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
            return {
                mode: policy.mode,
                version: policy.version,
                allowedCapabilities: policy.allowed_capabilities,
                allowedGroupUuids: policy.allowed_group_uuids,
            };
        });
    }
}
