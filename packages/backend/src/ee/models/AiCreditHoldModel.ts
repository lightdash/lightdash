import { type AiCreditHold, type AiCreditHoldReason } from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiCreditHoldsTableName,
    type DbAiCreditHold,
    type DbAiCreditHoldInsert,
} from '../database/entities/aiCredits';

type Dependencies = {
    database: Knex;
};

const toHold = (row: DbAiCreditHold): AiCreditHold => ({
    uuid: row.ai_credit_hold_uuid,
    organizationUuid: row.organization_uuid,
    userUuid: row.user_uuid,
    reason: row.reason,
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

    async place(hold: {
        organizationUuid: string;
        userUuid: string | null;
        reason: AiCreditHoldReason;
        notes: string | null;
        placedBy: string;
        expiresAt: Date | null;
    }): Promise<AiCreditHold> {
        const insert: DbAiCreditHoldInsert = {
            organization_uuid: hold.organizationUuid,
            user_uuid: hold.userUuid,
            reason: hold.reason,
            notes: hold.notes,
            placed_by: hold.placedBy,
            expires_at: hold.expiresAt,
        };
        const [row] = await this.database(AiCreditHoldsTableName)
            .insert(insert)
            .returning('*');
        return toHold(row);
    }

    async release(holdUuid: string): Promise<void> {
        await this.database(AiCreditHoldsTableName)
            .where({ ai_credit_hold_uuid: holdUuid })
            .whereNull('released_at')
            .update({ released_at: new Date() });
    }

    /** Holds still in force: not released, and not past their expiry. */
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
