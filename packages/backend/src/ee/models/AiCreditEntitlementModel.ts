import { type AiCreditEntitlement } from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiCreditEntitlementsTableName,
    type DbAiCreditEntitlement,
    type DbAiCreditEntitlementInsert,
} from '../database/entities/aiCredits';

type Dependencies = {
    database: Knex;
};

const toEntitlement = (row: DbAiCreditEntitlement): AiCreditEntitlement => ({
    uuid: row.ai_credit_entitlement_uuid,
    organizationUuid: row.organization_uuid,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    allowanceCredits:
        row.allowance_credits === null ? null : Number(row.allowance_credits),
});

export class AiCreditEntitlementModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    async findCovering(
        organizationUuid: string,
        at: Date,
    ): Promise<AiCreditEntitlement | null> {
        const row = await this.database(AiCreditEntitlementsTableName)
            .where({ organization_uuid: organizationUuid })
            .where('period_start', '<=', at)
            .where('period_end', '>', at)
            .orderBy('period_start', 'desc')
            .first();
        return row ? toEntitlement(row) : null;
    }

    async listForOrganization(
        organizationUuid: string,
    ): Promise<AiCreditEntitlement[]> {
        const rows = await this.database(AiCreditEntitlementsTableName)
            .where({ organization_uuid: organizationUuid })
            .orderBy('period_start', 'desc');
        return rows.map(toEntitlement);
    }

    async create(entitlement: {
        organizationUuid: string;
        periodStart: Date;
        periodEnd: Date;
        allowanceCredits: number | null;
    }): Promise<AiCreditEntitlement> {
        const insert: DbAiCreditEntitlementInsert = {
            organization_uuid: entitlement.organizationUuid,
            period_start: entitlement.periodStart,
            period_end: entitlement.periodEnd,
            allowance_credits: entitlement.allowanceCredits,
        };
        const [row] = await this.database(AiCreditEntitlementsTableName)
            .insert(insert)
            .returning('*');
        return toEntitlement(row);
    }
}
