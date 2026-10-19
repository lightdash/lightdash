import {
    getAgentIdentityWarehouseTypes,
    isAllowedAgentIdentitySource,
    ParameterError,
    WarehouseTypes,
    type AiActorKind,
    type AiIdentitySource,
    type OrganizationAgentIdentityRule,
    type UpdateOrganizationAgentIdentityRule,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    OrganizationAgentIdentityRulesTableName,
    type DbOrganizationAgentIdentityRule,
} from '../database/entities/organizationAgentIdentityRules';
import { OrganizationTableName } from '../database/entities/organizations';

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
        if (warehouseType === WarehouseTypes.SNOWFLAKE)
            return this.getSnowflakeRule(organizationUuid, actorKind);
        const row = await this.database(OrganizationAgentIdentityRulesTableName)
            .where({
                organization_uuid: organizationUuid,
                warehouse_type: warehouseType,
                actor_kind: actorKind,
            })
            .first();
        return { source: row?.source ?? 'marked_person' };
    }

    private async getSnowflakeRule(
        organizationUuid: string,
        actorKind: AiActorKind,
        database: Knex = this.database,
    ): Promise<UpdateOrganizationAgentIdentityRule> {
        const row = await database(
            'organization_agent_identity_settings as legacy',
        )
            .leftJoin(
                `${OrganizationAgentIdentityRulesTableName} as rules`,
                (join) => {
                    join.on(
                        'rules.organization_uuid',
                        'legacy.organization_uuid',
                    )
                        .andOnVal(
                            'rules.warehouse_type',
                            WarehouseTypes.SNOWFLAKE,
                        )
                        .andOnVal('rules.actor_kind', actorKind);
                },
            )
            .where('legacy.organization_uuid', organizationUuid)
            .first<{
                source: AiIdentitySource | null;
                require_verified_agent_sessions: boolean;
                timestamps_match: boolean | null;
            }>(
                'rules.source',
                'legacy.require_verified_agent_sessions',
                database.raw('?? = ?? as ??', [
                    'rules.updated_at',
                    'legacy.updated_at',
                    'timestamps_match',
                ]),
            );
        if (row?.source === 'ai_service_account' && row.timestamps_match)
            return { source: 'ai_service_account' };
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
            this.getSnowflakeRule(organizationUuid, 'person'),
            this.database(OrganizationAgentIdentityRulesTableName)
                .where({
                    organization_uuid: organizationUuid,
                    actor_kind: 'person',
                })
                .whereIn('warehouse_type', warehouseTypes),
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
    ): Promise<{ previousSource: AiIdentitySource; changed: boolean }> {
        if (!isAllowedAgentIdentitySource(warehouseType, rule.source)) {
            throw new ParameterError(
                'This identity source is not supported for the warehouse type',
            );
        }
        const write = async (transaction: Knex.Transaction) => {
            await transaction(OrganizationTableName)
                .where('organization_uuid', organizationUuid)
                .select('organization_uuid')
                .forUpdate()
                .first();
            const previous =
                warehouseType === WarehouseTypes.SNOWFLAKE
                    ? await this.getSnowflakeRule(
                          organizationUuid,
                          'person',
                          transaction,
                      )
                    : await transaction(OrganizationAgentIdentityRulesTableName)
                          .where({
                              organization_uuid: organizationUuid,
                              warehouse_type: warehouseType,
                              actor_kind: 'person',
                          })
                          .first('source');
            const previousSource: AiIdentitySource =
                previous?.source ?? 'marked_person';
            const actorKinds: AiActorKind[] = ['person', 'service_account'];
            await transaction<DbOrganizationAgentIdentityRule>(
                OrganizationAgentIdentityRulesTableName,
            )
                .insert(
                    actorKinds.map((actorKind) => ({
                        organization_uuid: organizationUuid,
                        warehouse_type: warehouseType,
                        actor_kind: actorKind,
                        source: rule.source,
                        created_at: transaction.fn.now(),
                        updated_at: transaction.fn.now(),
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
                        created_at: transaction.fn.now(),
                        updated_at: transaction.fn.now(),
                    })
                    .onConflict('organization_uuid')
                    .merge({
                        require_verified_agent_sessions:
                            requireVerifiedAgentSessions,
                        updated_at: transaction.fn.now(),
                    });
            }
            return { previousSource, changed: previousSource !== rule.source };
        };
        return trx ? write(trx) : this.database.transaction(write);
    }
}
