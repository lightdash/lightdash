import {
    AI_DIRECT_TRANSPORT,
    AiAccessPolicy,
    AiPrincipal,
    AiPrincipalKind,
    AiPrincipalStatus,
    AiPrincipalWithSecrets,
    AiProbeResult,
    aiProbeResultSchema,
    AiQueryAudit,
    AiTransport,
    aiTransportSchema,
    NotFoundError,
    ParameterError,
    UpsertAiAccessPolicy,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiAccessPoliciesTableName,
    AiPrincipalGroupMappingsTableName,
    AiPrincipalsTableName,
    AiQueryAuditTableName,
    DbAiAccessPolicy,
    DbAiPrincipal,
    DbAiQueryAudit,
} from '../../database/entities/aiPrincipals';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

export class AiPrincipalModel {
    private readonly database: Knex;
    private readonly encryptionUtil: EncryptionUtil;
    constructor(args: { database: Knex; encryptionUtil: EncryptionUtil }) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }
    private static transport(value: AiTransport): AiTransport {
        const parsed = aiTransportSchema.safeParse(value);
        return parsed.success ? parsed.data : AI_DIRECT_TRANSPORT;
    }
    private static probe(value: AiProbeResult | null): AiProbeResult | null {
        if (value === null) return null;
        const parsed = aiProbeResultSchema.safeParse(value);
        return parsed.success ? parsed.data : null;
    }
    private static principal(row: DbAiPrincipal): AiPrincipal {
        const lastProbe = AiPrincipalModel.probe(row.last_probe);
        return {
            aiPrincipalUuid: row.ai_principal_uuid,
            aiAccessPolicyUuid: row.ai_access_policy_uuid,
            kind: row.kind,
            ref: row.ref,
            userUuid: row.user_uuid,
            groupUuid: row.group_uuid,
            status: row.status,
            failureReason: row.failure_reason,
            statusMessage: row.status_message,
            lastProbe,
            publicKey: row.public_key,
            publicKeyFingerprint: row.public_key_fingerprint,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    private secrets(row: DbAiPrincipal): AiPrincipalWithSecrets {
        return {
            ...AiPrincipalModel.principal(row),
            secret: row.encrypted_secret
                ? this.encryptionUtil.decrypt(row.encrypted_secret)
                : null,
        };
    }
    private async policy(
        row: DbAiAccessPolicy,
        database = this.database,
    ): Promise<AiAccessPolicy> {
        const mappings = await database(AiPrincipalGroupMappingsTableName)
            .join(
                'groups',
                'groups.group_uuid',
                'ai_principal_group_mappings.group_uuid',
            )
            .select(
                'ai_principal_group_mappings.*',
                'groups.name as group_name',
            )
            .where('ai_access_policy_uuid', row.ai_access_policy_uuid)
            .orderBy('priority', 'desc')
            .orderBy('groups.name');
        return {
            aiAccessPolicyUuid: row.ai_access_policy_uuid,
            projectUuid: row.project_uuid,
            warehouseConnectionUuid: row.warehouse_connection_uuid,
            enabled: row.enabled,
            principalKind: row.principal_kind,
            transport: AiPrincipalModel.transport(row.transport),
            sharedRef: row.shared_ref,
            twinNameTemplate: row.twin_name_template,
            policySource: row.policy_source,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            groupMappings: mappings.map((m) => ({
                groupUuid: m.group_uuid,
                groupName: m.group_name,
                ref: m.ref,
                priority: m.priority,
            })),
        };
    }
    async findPolicy(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiAccessPolicy | null> {
        const row = await this.database(AiAccessPoliciesTableName)
            .where({
                project_uuid: projectUuid,
                warehouse_connection_uuid: warehouseConnectionUuid,
            })
            .first();
        return row ? this.policy(row) : null;
    }
    async getPolicy(aiAccessPolicyUuid: string): Promise<AiAccessPolicy> {
        const row = await this.database(AiAccessPoliciesTableName)
            .where('ai_access_policy_uuid', aiAccessPolicyUuid)
            .first();
        if (!row) throw new NotFoundError('AI access policy not found');
        return this.policy(row);
    }
    async upsertPolicy(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        upsert: UpsertAiAccessPolicy,
    ): Promise<AiAccessPolicy> {
        return this.database.transaction(async (trx) => {
            const values = {
                project_uuid: projectUuid,
                warehouse_connection_uuid: warehouseConnectionUuid,
                enabled: upsert.enabled,
                principal_kind: upsert.principalKind,
                transport: upsert.transport,
                shared_ref: upsert.sharedRef,
                twin_name_template: upsert.twinNameTemplate,
                policy_source: upsert.policySource,
            };
            const conflict =
                warehouseConnectionUuid === null
                    ? trx.raw(
                          '(project_uuid) WHERE warehouse_connection_uuid IS NULL',
                      )
                    : trx.raw(
                          '(project_uuid, warehouse_connection_uuid) WHERE warehouse_connection_uuid IS NOT NULL',
                      );
            const [row] = await trx(AiAccessPoliciesTableName)
                .insert(values)
                .onConflict(conflict)
                .merge({ ...values, updated_at: new Date() })
                .returning('*');
            await trx(AiPrincipalGroupMappingsTableName)
                .where('ai_access_policy_uuid', row.ai_access_policy_uuid)
                .delete();
            if (upsert.groupMappings.length)
                await trx(AiPrincipalGroupMappingsTableName).insert(
                    upsert.groupMappings.map((m) => ({
                        ai_access_policy_uuid: row.ai_access_policy_uuid,
                        group_uuid: m.groupUuid,
                        ref: m.ref,
                        priority: m.priority,
                    })),
                );
            return this.policy(row, trx);
        });
    }
    async listPrincipals(aiAccessPolicyUuid: string): Promise<AiPrincipal[]> {
        const rows = await this.database(AiPrincipalsTableName)
            .where('ai_access_policy_uuid', aiAccessPolicyUuid)
            .orderBy('ref');
        return rows.map(AiPrincipalModel.principal);
    }
    async getPrincipal(
        aiPrincipalUuid: string,
    ): Promise<AiPrincipalWithSecrets> {
        const row = await this.database(AiPrincipalsTableName)
            .where('ai_principal_uuid', aiPrincipalUuid)
            .first();
        if (!row) throw new NotFoundError('AI principal not found');
        return this.secrets(row);
    }
    async findPrincipalByRef(args: {
        aiAccessPolicyUuid: string;
        ref: string;
    }): Promise<AiPrincipalWithSecrets | null> {
        const row = await this.database(AiPrincipalsTableName)
            .where({
                ai_access_policy_uuid: args.aiAccessPolicyUuid,
                ref: args.ref,
            })
            .first();
        return row ? this.secrets(row) : null;
    }
    async findPrincipalForUser(args: {
        aiAccessPolicyUuid: string;
        userUuid: string;
    }): Promise<AiPrincipalWithSecrets | null> {
        const row = await this.database(AiPrincipalsTableName)
            .where({
                ai_access_policy_uuid: args.aiAccessPolicyUuid,
                user_uuid: args.userUuid,
            })
            .first();
        return row ? this.secrets(row) : null;
    }
    async createPrincipal(args: {
        aiAccessPolicyUuid: string;
        kind: AiPrincipalKind;
        ref: string;
        userUuid: string | null;
        groupUuid: string | null;
    }): Promise<AiPrincipal> {
        const [row] = await this.database(AiPrincipalsTableName)
            .insert({
                ai_access_policy_uuid: args.aiAccessPolicyUuid,
                kind: args.kind,
                ref: args.ref,
                user_uuid: args.userUuid,
                group_uuid: args.groupUuid,
                status: AiPrincipalStatus.PENDING,
            })
            .onConflict(['ai_access_policy_uuid', 'ref'])
            .ignore()
            .returning('*')
            .catch((error: unknown) => {
                if (
                    typeof error === 'object' &&
                    error !== null &&
                    'code' in error &&
                    error.code === '23505'
                ) {
                    throw new ParameterError(
                        'This person already has an AI principal on this policy with another reference.',
                    );
                }
                throw error;
            });
        if (row) return AiPrincipalModel.principal(row);
        const existing = await this.database(AiPrincipalsTableName)
            .where({
                ai_access_policy_uuid: args.aiAccessPolicyUuid,
                ref: args.ref,
            })
            .first();
        if (!existing) throw new NotFoundError('AI principal not found');
        return AiPrincipalModel.principal(existing);
    }
    async setSecret(
        aiPrincipalUuid: string,
        keys: {
            secret: string;
            publicKey: string | null;
            publicKeyFingerprint: string | null;
        },
    ): Promise<void> {
        await this.database(AiPrincipalsTableName)
            .where('ai_principal_uuid', aiPrincipalUuid)
            .update({
                public_key: keys.publicKey,
                public_key_fingerprint: keys.publicKeyFingerprint,
                encrypted_secret: this.encryptionUtil.encrypt(keys.secret),
                updated_at: new Date(),
            });
    }
    async recordProbe(
        aiPrincipalUuid: string,
        probe: AiProbeResult,
    ): Promise<AiPrincipal> {
        const [row] = await this.database(AiPrincipalsTableName)
            .where('ai_principal_uuid', aiPrincipalUuid)
            .update({
                ...(probe.ok || !probe.transient
                    ? {
                          status: probe.ok
                              ? AiPrincipalStatus.READY
                              : AiPrincipalStatus.FAILED,
                          failure_reason: probe.ok ? null : probe.reason,
                      }
                    : {}),
                status_message: probe.ok ? null : probe.message,
                last_probe: probe,
                updated_at: new Date(),
            })
            .returning('*');
        if (!row) throw new NotFoundError('AI principal not found');
        return AiPrincipalModel.principal(row);
    }
    async resetStatus(aiPrincipalUuid: string): Promise<AiPrincipal> {
        const [row] = await this.database(AiPrincipalsTableName)
            .where('ai_principal_uuid', aiPrincipalUuid)
            .update({
                status: AiPrincipalStatus.PENDING,
                failure_reason: null,
                status_message: null,
                last_probe: null,
                updated_at: new Date(),
            })
            .returning('*');
        if (!row) throw new NotFoundError('AI principal not found');
        return AiPrincipalModel.principal(row);
    }
    async deletePrincipal(aiPrincipalUuid: string): Promise<void> {
        await this.database(AiPrincipalsTableName)
            .where('ai_principal_uuid', aiPrincipalUuid)
            .delete();
    }
    async insertAudit(audit: Omit<AiQueryAudit, 'createdAt'>): Promise<void> {
        await this.database(AiQueryAuditTableName)
            .insert({
                query_uuid: audit.queryUuid,
                project_uuid: audit.projectUuid,
                warehouse_connection_uuid: audit.warehouseConnectionUuid,
                user_uuid: audit.userUuid,
                ai_principal_uuid: audit.aiPrincipalUuid,
                principal_kind: audit.principalKind,
                principal_ref: audit.principalRef,
                transport: audit.transport,
                probe_ok: audit.probeOk,
                probe_checked_at: audit.probeCheckedAt,
                person_tag: audit.personTag,
            })
            .onConflict('query_uuid')
            .merge();
    }
    private static audit(row: DbAiQueryAudit): AiQueryAudit {
        return {
            queryUuid: row.query_uuid,
            projectUuid: row.project_uuid,
            warehouseConnectionUuid: row.warehouse_connection_uuid,
            userUuid: row.user_uuid,
            aiPrincipalUuid: row.ai_principal_uuid,
            principalKind: row.principal_kind,
            principalRef: row.principal_ref,
            transport: AiPrincipalModel.transport(row.transport),
            probeOk: row.probe_ok,
            probeCheckedAt: row.probe_checked_at,
            personTag: row.person_tag,
            createdAt: row.created_at,
        };
    }
    async listAudit(
        projectUuid: string,
        args: { page: number; pageSize: number },
    ): Promise<{
        data: AiQueryAudit[];
        pagination: {
            page: number;
            pageSize: number;
            totalResults: number;
            totalPageCount: number;
        };
    }> {
        const [count] = await this.database(AiQueryAuditTableName)
            .where('project_uuid', projectUuid)
            .count<{ total: string }[]>('* as total');
        const rows = await this.database(AiQueryAuditTableName)
            .where('project_uuid', projectUuid)
            .orderBy('created_at', 'desc')
            .limit(args.pageSize)
            .offset((args.page - 1) * args.pageSize);
        const totalResults = Number(count.total);
        return {
            data: rows.map(AiPrincipalModel.audit),
            pagination: {
                ...args,
                totalResults,
                totalPageCount: Math.ceil(totalResults / args.pageSize),
            },
        };
    }
}
