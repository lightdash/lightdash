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
        if (warehouseType === WarehouseTypes.SNOWFLAKE) {
            return this.getSnowflakeRule(organizationUuid);
        }
        const row = await this.database(OrganizationAgentIdentityRulesTableName)
            .where({
                organization_uuid: organizationUuid,
                warehouse_type: warehouseType,
                actor_kind: actorKind,
            })
            .first();
        return {
            source: row?.source ?? 'marked_person',
        };
    }

    private async getSnowflakeRule(
        organizationUuid: string,
    ): Promise<UpdateOrganizationAgentIdentityRule> {
        const row = await this.database<{
            require_verified_agent_sessions: boolean;
        }>('organization_agent_identity_settings')
            .where('organization_uuid', organizationUuid)
            .first('require_verified_agent_sessions');
        return {
            source: row?.require_verified_agent_sessions
                ? 'agent_sign_in'
                : 'marked_person',
        };
    }

    async list(
        organizationUuid: string,
    ): Promise<OrganizationAgentIdentityRule[]> {
        const warehouseTypes = getAgentIdentityWarehouseTypes();
        const [snowflakeRule, rows] = await Promise.all([
            this.getSnowflakeRule(organizationUuid),
            this.database(OrganizationAgentIdentityRulesTableName)
                .where({
                    organization_uuid: organizationUuid,
                    actor_kind: 'person',
                })
                .whereIn(
                    'warehouse_type',
                    warehouseTypes.filter(
                        (type) => type !== WarehouseTypes.SNOWFLAKE,
                    ),
                ),
        ]);
        return warehouseTypes.map((warehouseType) => {
            const row = rows.find(
                (candidate) => candidate.warehouse_type === warehouseType,
            );
            return {
                warehouseType,
                source:
                    warehouseType === WarehouseTypes.SNOWFLAKE
                        ? snowflakeRule.source
                        : (row?.source ?? 'marked_person'),
                projectsMissingAiServiceAccount: null,
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
                    })),
                )
                .onConflict([
                    'organization_uuid',
                    'warehouse_type',
                    'actor_kind',
                ])
                .merge({
                    source: rule.source,
                    updated_at: transaction.fn.now(),
                });
            if (warehouseType === WarehouseTypes.SNOWFLAKE) {
                const requireVerifiedAgentSessions =
                    rule.source === 'agent_sign_in';
                await transaction('organization_agent_identity_settings')
                    .insert({
                        organization_uuid: organizationUuid,
                        require_verified_agent_sessions:
                            requireVerifiedAgentSessions,
                    })
                    .onConflict('organization_uuid')
                    .merge({
                        require_verified_agent_sessions:
                            requireVerifiedAgentSessions,
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
