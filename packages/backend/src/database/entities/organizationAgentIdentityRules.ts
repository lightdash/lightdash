import {
    type AiActorKind,
    type AiIdentitySource,
    type WarehouseTypes,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const OrganizationAgentIdentityRulesTableName =
    'organization_agent_identity_rules';

export type DbOrganizationAgentIdentityRule = {
    organization_uuid: string;
    warehouse_type: WarehouseTypes;
    actor_kind: AiActorKind;
    source: AiIdentitySource;
    required: boolean;
    created_at: Date;
    updated_at: Date;
};

export type DbOrganizationAgentIdentityRuleInsert = Omit<
    DbOrganizationAgentIdentityRule,
    'created_at' | 'updated_at' | 'required'
> &
    Partial<
        Pick<
            DbOrganizationAgentIdentityRule,
            'created_at' | 'updated_at' | 'required'
        >
    >;

export type OrganizationAgentIdentityRulesTable = Knex.CompositeTableType<
    DbOrganizationAgentIdentityRule,
    DbOrganizationAgentIdentityRuleInsert,
    Partial<DbOrganizationAgentIdentityRuleInsert>
>;
