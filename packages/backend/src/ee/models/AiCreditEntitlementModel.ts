import { type AiCreditEntitlement } from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiCreditEntitlementsTableName,
    type DbAiCreditEntitlement,
} from '../database/entities/aiCredits';

type Dependencies = {
    database: Knex;
};

export type AiCreditEntitlementWithAllowance = AiCreditEntitlement & {
    allowanceCredits: number;
};

const toEntitlement = (row: DbAiCreditEntitlement): AiCreditEntitlement => ({
    uuid: row.ai_credit_entitlement_uuid,
    organizationUuid: row.organization_uuid,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    allowanceCredits:
        row.allowance_credits === null ? null : Number(row.allowance_credits),
});

const hasAllowance = (
    entitlement: AiCreditEntitlement,
): entitlement is AiCreditEntitlementWithAllowance =>
    entitlement.allowanceCredits !== null;

export class AiCreditEntitlementModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    /** Every entitlement whose period covers the instant, agreed allowance or not. */
    async findCovering(
        organizationUuid: string,
        at: Date,
    ): Promise<AiCreditEntitlement[]> {
        const rows = await this.database(AiCreditEntitlementsTableName)
            .where({ organization_uuid: organizationUuid })
            .where('period_start', '<=', at)
            .where('period_end', '>', at)
            .orderBy('period_start', 'desc');
        return rows.map(toEntitlement);
    }

    // Periods may overlap, e.g. a monthly reset inside an annual pool, and each allowance applies on its own.
    async findCoveringWithAllowance(
        organizationUuid: string,
        at: Date,
    ): Promise<AiCreditEntitlementWithAllowance[]> {
        const rows = await this.database(AiCreditEntitlementsTableName)
            .where({ organization_uuid: organizationUuid })
            .where('period_start', '<=', at)
            .where('period_end', '>', at)
            .whereNotNull('allowance_credits')
            .orderBy('period_start', 'desc');
        return rows.map(toEntitlement).filter(hasAllowance);
    }
}
