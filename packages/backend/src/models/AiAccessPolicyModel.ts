import {
    AI_DIRECT_TRANSPORT,
    aiTransportSchema,
    type AiAccessPolicy,
    type AiTransport,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AiAccessPoliciesTableName,
    type DbAiAccessPolicy,
} from '../database/entities/aiPrincipals';

export class AiAccessPolicyModel {
    private readonly database: Knex;
    constructor(args: { database: Knex }) {
        this.database = args.database;
    }
    private static transport(value: AiTransport): AiTransport {
        const parsed = aiTransportSchema.safeParse(value);
        return parsed.success ? parsed.data : AI_DIRECT_TRANSPORT;
    }
    private async policy(row: DbAiAccessPolicy): Promise<AiAccessPolicy> {
        return {
            aiAccessPolicyUuid: row.ai_access_policy_uuid,
            projectUuid: row.project_uuid,
            warehouseConnectionUuid: row.warehouse_connection_uuid,
            enabled: row.enabled,
            principalKind: row.principal_kind,
            transport: AiAccessPolicyModel.transport(row.transport),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
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
            return this.policy(row);
        });
    }
}
