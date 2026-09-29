import { type AiCreditEntitlement, type AiCreditHold } from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiCreditHoldsTableName,
    type DbAiCreditHold,
} from '../database/entities/aiCredits';

type Dependencies = {
    database: Knex;
};

const SYSTEM_PLACED_BY = 'system';

const toHold = (row: DbAiCreditHold): AiCreditHold => ({
    uuid: row.ai_credit_hold_uuid,
    organizationUuid: row.organization_uuid,
    userUuid: row.user_uuid,
    entitlementUuid: row.ai_credit_entitlement_uuid,
    reason: row.reason,
    notes: row.notes,
    placedBy: row.placed_by,
    placedAt: row.placed_at,
    expiresAt: row.expires_at,
    releasedAt: row.released_at,
});

export class AiCreditHoldModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    async findAllowanceExhaustedHold(
        entitlementUuid: string,
    ): Promise<AiCreditHold | undefined> {
        const row = await this.database(AiCreditHoldsTableName)
            .where({
                ai_credit_entitlement_uuid: entitlementUuid,
                reason: 'allowance_exhausted',
            })
            .first();
        return row ? toHold(row) : undefined;
    }

    async findActiveAllowanceExhaustedHoldUntil(
        organizationUuid: string,
        until: Date,
    ): Promise<AiCreditHold | undefined> {
        const row = await this.database(AiCreditHoldsTableName)
            .where({
                organization_uuid: organizationUuid,
                user_uuid: null,
                reason: 'allowance_exhausted',
            })
            .whereNull('released_at')
            .where('expires_at', '>=', until)
            .first();
        return row ? toHold(row) : undefined;
    }

    /** Undefined when a concurrent call already placed the hold for this entitlement. */
    async createAllowanceExhaustedHold(
        entitlement: AiCreditEntitlement,
    ): Promise<AiCreditHold | undefined> {
        const [row] = await this.database(AiCreditHoldsTableName)
            .insert({
                organization_uuid: entitlement.organizationUuid,
                user_uuid: null,
                ai_credit_entitlement_uuid: entitlement.uuid,
                reason: 'allowance_exhausted',
                notes: null,
                placed_by: SYSTEM_PLACED_BY,
                expires_at: entitlement.periodEnd,
            })
            .onConflict()
            .ignore()
            .returning('*');
        return row ? toHold(row) : undefined;
    }

    async findActive(
        organizationUuid: string,
        at: Date = new Date(),
    ): Promise<AiCreditHold[]> {
        const rows = await this.database(AiCreditHoldsTableName)
            .where({ organization_uuid: organizationUuid })
            .whereNull('released_at')
            .where((builder) => {
                void builder
                    .whereNull('expires_at')
                    .orWhere('expires_at', '>', at);
            })
            .orderBy('placed_at', 'desc');
        return rows.map(toHold);
    }
}
