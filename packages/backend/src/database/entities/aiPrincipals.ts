import { AiPrincipalKind, AiTransport } from '@lightdash/common';
import { Knex } from 'knex';

export type DbAiAccessPolicy = {
    ai_access_policy_uuid: string;
    project_uuid: string;
    warehouse_connection_uuid: string | null;
    enabled: boolean;
    principal_kind: AiPrincipalKind;
    transport: AiTransport;
    created_at: Date;
    updated_at: Date;
};
export const AiAccessPoliciesTableName = 'ai_access_policies';
export type AiAccessPoliciesTable = Knex.CompositeTableType<
    DbAiAccessPolicy,
    Omit<
        DbAiAccessPolicy,
        'ai_access_policy_uuid' | 'created_at' | 'updated_at'
    >,
    Partial<Omit<DbAiAccessPolicy, 'ai_access_policy_uuid' | 'created_at'>>
>;
