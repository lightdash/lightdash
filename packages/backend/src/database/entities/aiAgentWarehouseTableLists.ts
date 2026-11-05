import { type WarehouseTablesCatalog } from '@lightdash/common';
import { type Knex } from 'knex';

export const AiAgentWarehouseTableListsTableName =
    'ai_agent_warehouse_table_lists';

export type DbAiAgentWarehouseTableList = {
    ai_agent_warehouse_table_list_uuid: string;
    owner_kind: 'agent_sign_in' | 'ai_service_account';
    user_uuid: string | null;
    ai_service_account_credential_uuid: string | null;
    credential_generation: string;
    project_uuid: string;
    scope_fingerprint: string;
    tables: WarehouseTablesCatalog;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentWarehouseTableListsTable = Knex.CompositeTableType<
    DbAiAgentWarehouseTableList,
    Omit<
        DbAiAgentWarehouseTableList,
        'ai_agent_warehouse_table_list_uuid' | 'created_at' | 'updated_at'
    >,
    Partial<
        Pick<
            DbAiAgentWarehouseTableList,
            'credential_generation' | 'tables' | 'updated_at'
        >
    >
>;
