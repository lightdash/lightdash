import {
    getAgentIdentityWarehouseTypes,
    isAllowedAgentIdentitySource,
    ParameterError,
    WarehouseTypes,
    type AiActorKind,
    type OrganizationAgentIdentityRule,
    type UpdateOrganizationAgentIdentityRule,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { OrganizationAgentIdentityRulesTableName } from '../database/entities/organizationAgentIdentityRules';

export class OrganizationAgentIdentityRulesModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async get(
        organizationUuid: string,
        warehouseType: WarehouseTypes,
        actorKind: AiActorKind,
    ): Promise<UpdateOrganizationAgentIdentityRule> {
        const row = await this.database(OrganizationAgentIdentityRulesTableName)
            .where({
                organization_uuid: organizationUuid,
                warehouse_type: warehouseType,
                actor_kind: actorKind,
            })
            .first();
        return {
            source: row?.source ?? 'marked_person',
            required: row?.required ?? false,
        };
    }

    async list(
        organizationUuid: string,
    ): Promise<OrganizationAgentIdentityRule[]> {
        const warehouseTypes = getAgentIdentityWarehouseTypes();
        const rows = await this.database(
            OrganizationAgentIdentityRulesTableName,
        )
            .where({
                organization_uuid: organizationUuid,
                actor_kind: 'person',
            })
            .whereIn('warehouse_type', warehouseTypes);
        return warehouseTypes.map((warehouseType) => {
            const row = rows.find(
                (candidate) => candidate.warehouse_type === warehouseType,
            );
            return {
                warehouseType,
                source: row?.source ?? 'marked_person',
                required: row?.required ?? false,
            };
        });
    }

    async set(
        organizationUuid: string,
        warehouseType: WarehouseTypes,
        rule: UpdateOrganizationAgentIdentityRule,
        trx?: Knex.Transaction,
    ): Promise<void> {
        if (!isAllowedAgentIdentitySource(warehouseType, rule.source)) {
            throw new ParameterError(
                'This identity source is not supported for the warehouse type',
            );
        }
        const write = async (transaction: Knex.Transaction) => {
            const actorKinds: AiActorKind[] = ['person', 'service_account'];
            await transaction(OrganizationAgentIdentityRulesTableName)
                .insert(
                    actorKinds.map((actorKind) => ({
                        organization_uuid: organizationUuid,
                        warehouse_type: warehouseType,
                        actor_kind: actorKind,
                        source: rule.source,
                        required: rule.required,
                    })),
                )
                .onConflict([
                    'organization_uuid',
                    'warehouse_type',
                    'actor_kind',
                ])
                .merge({
                    source: rule.source,
                    required: rule.required,
                    updated_at: transaction.fn.now(),
                });
            if (warehouseType === WarehouseTypes.SNOWFLAKE) {
                const required =
                    rule.source === 'agent_sign_in' && rule.required;
                await transaction('organization_agent_identity_settings')
                    .insert({
                        organization_uuid: organizationUuid,
                        require_verified_agent_sessions: required,
                    })
                    .onConflict('organization_uuid')
                    .merge({
                        require_verified_agent_sessions: required,
                        updated_at: transaction.fn.now(),
                    });
            }
        };
        if (trx) {
            await write(trx);
        } else {
            await this.database.transaction(write);
        }
    }
}
