import {
    AiPolicySource,
    AiPrincipalFailureReason,
    AiPrincipalKind,
    AiPrincipalStatus,
    AiProbeResult,
    AiTransport,
} from '@lightdash/common';
import { Knex } from 'knex';

export type DbAiAccessPolicy = {
    ai_access_policy_uuid: string;
    project_uuid: string;
    warehouse_connection_uuid: string | null;
    enabled: boolean;
    principal_kind: AiPrincipalKind;
    transport: AiTransport;
    shared_ref: string | null;
    twin_name_template: string | null;
    policy_source: AiPolicySource | null;
    created_at: Date;
    updated_at: Date;
};
export type DbAiPrincipalGroupMapping = {
    ai_principal_group_mapping_uuid: string;
    ai_access_policy_uuid: string;
    group_uuid: string;
    ref: string;
    priority: number;
    created_at: Date;
};
export type DbAiPrincipal = {
    ai_principal_uuid: string;
    ai_access_policy_uuid: string;
    kind: AiPrincipalKind;
    ref: string;
    user_uuid: string | null;
    group_uuid: string | null;
    status: AiPrincipalStatus;
    failure_reason: AiPrincipalFailureReason | null;
    status_message: string | null;
    last_probe: AiProbeResult | null;
    public_key: string | null;
    public_key_fingerprint: string | null;
    encrypted_secret: Buffer | null;
    created_at: Date;
    updated_at: Date;
};
export const AiAccessPoliciesTableName = 'ai_access_policies';
export const AiPrincipalGroupMappingsTableName = 'ai_principal_group_mappings';
export const AiPrincipalsTableName = 'ai_principals';
export type AiAccessPoliciesTable = Knex.CompositeTableType<
    DbAiAccessPolicy,
    Omit<
        DbAiAccessPolicy,
        'ai_access_policy_uuid' | 'created_at' | 'updated_at'
    >,
    Partial<Omit<DbAiAccessPolicy, 'ai_access_policy_uuid' | 'created_at'>>
>;
export type AiPrincipalGroupMappingsTable = Knex.CompositeTableType<
    DbAiPrincipalGroupMapping,
    Omit<
        DbAiPrincipalGroupMapping,
        'ai_principal_group_mapping_uuid' | 'created_at'
    >,
    Partial<Pick<DbAiPrincipalGroupMapping, 'ref' | 'priority'>>
>;
export type AiPrincipalsTable = Knex.CompositeTableType<
    DbAiPrincipal,
    Pick<
        DbAiPrincipal,
        | 'ai_access_policy_uuid'
        | 'kind'
        | 'ref'
        | 'user_uuid'
        | 'group_uuid'
        | 'status'
    >,
    Partial<Omit<DbAiPrincipal, 'ai_principal_uuid' | 'created_at'>>
>;
