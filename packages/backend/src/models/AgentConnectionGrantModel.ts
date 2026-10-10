import {
    AGENT_CAPABILITY_DEFINITIONS,
    AGENT_CONNECTION_GRANT_CONTRACT_VERSION,
    AGENT_CONNECTION_GRANT_MAX_TTL_MS,
    NotFoundError,
    ParameterError,
    type AgentConnectionGrant,
    type AgentConnectionGrantCreate,
    type AgentConnectionGrantWithStatus,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AgentConnectionGrantsTableName,
    type DbAgentConnectionGrant,
} from '../database/entities/agentConnectionGrants';

const toGrant = (row: DbAgentConnectionGrant): AgentConnectionGrant => ({
    grantUuid: row.agent_connection_grant_uuid,
    organizationUuid: row.organization_uuid,
    subjectUserUuid: row.subject_user_uuid,
    clientId: row.client_id,
    credentialKind: row.credential_kind,
    actorKind: row.actor_kind,
    name: row.name,
    resource: row.resource,
    refreshFamilyUuid: row.refresh_family_uuid,
    approvedCapabilities: row.approved_capabilities,
    approvedProjectUuids: row.approved_project_uuids,
    resourceConstraints: row.resource_constraints,
    grantContractVersion: row.grant_contract_version,
    grantRevision: row.grant_revision,
    approvalPolicyVersion: row.approval_policy_version,
    approvedByUserUuid: row.approved_by_user_uuid,
    approvalMethod: row.approval_method,
    approvedAt: row.approved_at,
    approvalRequestUuid: row.approval_request_uuid,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedByUserUuid: row.revoked_by_user_uuid,
    revocationReason: row.revocation_reason,
    replacedByGrantUuid: row.replaced_by_grant_uuid,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
});

const getStatus = (
    grant: AgentConnectionGrant,
    now: Date,
): AgentConnectionGrantWithStatus['status'] => {
    if (grant.revokedAt !== null) return 'revoked';
    if (grant.expiresAt.getTime() <= now.getTime()) return 'expired';
    return 'active';
};

type RevokeGrant = {
    organizationUuid: string;
    grantUuid: string;
    revokedByUserUuid: string | null;
    reason: string;
};

export class AgentConnectionGrantModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private static async createWithDatabase(
        database: Knex,
        input: AgentConnectionGrantCreate,
    ): Promise<AgentConnectionGrant> {
        const approvedCapabilities = [...new Set(input.approvedCapabilities)];
        if (
            approvedCapabilities.some(
                (capability) =>
                    !Object.hasOwn(AGENT_CAPABILITY_DEFINITIONS, capability),
            )
        ) {
            throw new ParameterError('Unknown agent capability');
        }
        const approvedProjectUuids = [...new Set(input.approvedProjectUuids)];
        if (approvedProjectUuids.length === 0) {
            throw new ParameterError('At least one project must be approved');
        }
        const now = new Date();
        const expiresAt = input.expiresAt.getTime();
        if (
            !Number.isFinite(expiresAt) ||
            expiresAt <= now.getTime() ||
            expiresAt > now.getTime() + AGENT_CONNECTION_GRANT_MAX_TTL_MS
        ) {
            throw new ParameterError(
                'Grant expiry must be in the future and within seven days',
            );
        }
        const projects = await database('projects')
            .join(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where('organizations.organization_uuid', input.organizationUuid)
            .whereIn('projects.project_uuid', approvedProjectUuids)
            .select('projects.project_uuid');
        const projectUuids = new Set(
            projects.map((project) => project.project_uuid),
        );
        if (approvedProjectUuids.some((uuid) => !projectUuids.has(uuid))) {
            throw new ParameterError(
                'All approved projects must belong to this organization',
            );
        }
        const [row] = await database(AgentConnectionGrantsTableName)
            .insert({
                organization_uuid: input.organizationUuid,
                subject_user_uuid: input.subjectUserUuid,
                client_id: input.clientId,
                credential_kind: 'oauth',
                actor_kind: 'agent',
                name: input.name,
                resource: input.resource,
                approved_capabilities: approvedCapabilities,
                approved_project_uuids: approvedProjectUuids,
                resource_constraints: input.resourceConstraints,
                grant_contract_version: AGENT_CONNECTION_GRANT_CONTRACT_VERSION,
                grant_revision: 1,
                approval_policy_version: input.approvalPolicyVersion,
                approved_by_user_uuid: input.approvedByUserUuid,
                approval_method: 'browser_consent',
                approved_at: now,
                approval_request_uuid: input.approvalRequestUuid,
                expires_at: input.expiresAt,
            })
            .returning('*');
        return toGrant(row);
    }

    async create(
        input: AgentConnectionGrantCreate,
    ): Promise<AgentConnectionGrant> {
        return this.database.transaction((transaction) =>
            AgentConnectionGrantModel.createWithDatabase(transaction, input),
        );
    }

    async find(grantUuid: string): Promise<AgentConnectionGrant | null> {
        const row = await this.database(AgentConnectionGrantsTableName)
            .where('agent_connection_grant_uuid', grantUuid)
            .first();
        return row ? toGrant(row) : null;
    }

    async findActive(
        grantUuid: string,
        now: Date,
    ): Promise<AgentConnectionGrant | null> {
        const grant = await this.find(grantUuid);
        return grant && getStatus(grant, now) === 'active' ? grant : null;
    }

    async listForSubject({
        organizationUuid,
        subjectUserUuid,
    }: {
        organizationUuid: string;
        subjectUserUuid: string;
    }): Promise<AgentConnectionGrantWithStatus[]> {
        const rows = await this.database(AgentConnectionGrantsTableName)
            .where('organization_uuid', organizationUuid)
            .where('subject_user_uuid', subjectUserUuid)
            .orderBy('created_at', 'desc');
        const now = new Date();
        return rows.map((row) => {
            const grant = toGrant(row);
            return { ...grant, status: getStatus(grant, now) };
        });
    }

    private static async revokeWithDatabase(
        database: Knex,
        { organizationUuid, grantUuid, revokedByUserUuid, reason }: RevokeGrant,
    ): Promise<void> {
        const [grant] = await database(AgentConnectionGrantsTableName)
            .where('agent_connection_grant_uuid', grantUuid)
            .where('organization_uuid', organizationUuid)
            .update({
                revoked_at: database.raw('coalesce(revoked_at, now())'),
                revoked_by_user_uuid: database.raw(
                    'CASE WHEN revoked_at IS NULL THEN ?::uuid ELSE revoked_by_user_uuid END',
                    [revokedByUserUuid],
                ),
                revocation_reason: database.raw(
                    'CASE WHEN revoked_at IS NULL THEN ?::text ELSE revocation_reason END',
                    [reason],
                ),
            })
            .returning('*');
        if (!grant) throw new NotFoundError('Agent connection grant not found');
        await database('oauth2_authorization_codes')
            .where(
                'agent_connection_grant_uuid',
                grant.agent_connection_grant_uuid,
            )
            .delete();
        await database('oauth2_refresh_tokens')
            .where(
                'agent_connection_grant_uuid',
                grant.agent_connection_grant_uuid,
            )
            .update({
                revoked_at: database.raw('coalesce(revoked_at, now())'),
            });
        if (grant.refresh_family_uuid !== null) {
            await database('oauth2_refresh_tokens')
                .where('family_uuid', grant.refresh_family_uuid)
                .update({
                    revoked_at: database.raw('coalesce(revoked_at, now())'),
                });
            await database('oauth2_access_tokens')
                .where('family_uuid', grant.refresh_family_uuid)
                .whereNull('agent_connection_grant_uuid')
                .delete();
        }
    }

    async revoke(input: RevokeGrant): Promise<void> {
        return this.database.transaction((transaction) =>
            AgentConnectionGrantModel.revokeWithDatabase(transaction, input),
        );
    }

    async replace({
        organizationUuid,
        oldGrantUuid,
        newGrantInput,
        actorUserUuid,
    }: {
        organizationUuid: string;
        oldGrantUuid: string;
        newGrantInput: AgentConnectionGrantCreate;
        actorUserUuid: string;
    }): Promise<AgentConnectionGrant> {
        return this.database.transaction(async (transaction) => {
            const oldGrant = await transaction(AgentConnectionGrantsTableName)
                .where('agent_connection_grant_uuid', oldGrantUuid)
                .where('organization_uuid', organizationUuid)
                .forUpdate()
                .first();
            if (!oldGrant)
                throw new NotFoundError('Agent connection grant not found');
            if (
                oldGrant.subject_user_uuid !== newGrantInput.subjectUserUuid ||
                oldGrant.organization_uuid !== newGrantInput.organizationUuid ||
                oldGrant.client_id !== newGrantInput.clientId
            ) {
                throw new ParameterError(
                    'Replacement must have the same subject, organization and client',
                );
            }
            if (oldGrant.revoked_at !== null)
                throw new ParameterError('Cannot replace a revoked grant');
            const newGrant = await AgentConnectionGrantModel.createWithDatabase(
                transaction,
                newGrantInput,
            );
            await AgentConnectionGrantModel.revokeWithDatabase(transaction, {
                organizationUuid,
                grantUuid: oldGrantUuid,
                revokedByUserUuid: actorUserUuid,
                reason: 'replaced',
            });
            await transaction(AgentConnectionGrantsTableName)
                .where('agent_connection_grant_uuid', oldGrantUuid)
                .where('organization_uuid', organizationUuid)
                .update({ replaced_by_grant_uuid: newGrant.grantUuid });
            return newGrant;
        });
    }

    async bindRefreshFamily({
        organizationUuid,
        grantUuid,
        familyUuid,
    }: {
        organizationUuid: string;
        grantUuid: string;
        familyUuid: string;
    }): Promise<void> {
        const updated = await this.database(AgentConnectionGrantsTableName)
            .where('agent_connection_grant_uuid', grantUuid)
            .where('organization_uuid', organizationUuid)
            .andWhere((query) =>
                query
                    .whereNull('refresh_family_uuid')
                    .orWhere('refresh_family_uuid', familyUuid),
            )
            .update({ refresh_family_uuid: familyUuid });
        if (updated === 0)
            throw new ParameterError(
                'Grant is missing or already bound to another refresh family',
            );
    }

    async touchLastUsed(grantUuid: string): Promise<void> {
        const now = new Date();
        await this.database(AgentConnectionGrantsTableName)
            .where('agent_connection_grant_uuid', grantUuid)
            .andWhere((query) =>
                query
                    .whereNull('last_used_at')
                    .orWhere(
                        'last_used_at',
                        '<=',
                        new Date(now.getTime() - 60000),
                    ),
            )
            .update({ last_used_at: now });
    }
}
