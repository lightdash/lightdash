import { type Knex } from 'knex';

export const AgentWarehouseRestrictionConfirmationsTableName =
    'agent_warehouse_restriction_confirmations';

export interface DbAgentWarehouseRestrictionConfirmation {
    project_uuid: string;
    binding_fingerprint: string;
    confirmed_by_user_uuid: string | null;
    confirmed_at: Date;
}

export interface DbAgentWarehouseRestrictionConfirmationInsert extends Omit<
    DbAgentWarehouseRestrictionConfirmation,
    'confirmed_at'
> {}

export type AgentWarehouseRestrictionConfirmationsTable =
    Knex.CompositeTableType<
        DbAgentWarehouseRestrictionConfirmation,
        DbAgentWarehouseRestrictionConfirmationInsert,
        Partial<DbAgentWarehouseRestrictionConfirmation>
    >;
