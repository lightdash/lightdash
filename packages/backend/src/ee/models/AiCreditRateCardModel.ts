import { type AiCreditRateCardRow } from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiCreditRateCardTableName,
    type DbAiCreditRateCard,
} from '../database/entities/aiCredits';

type Dependencies = {
    database: Knex;
};

const toRateCardRow = (row: DbAiCreditRateCard): AiCreditRateCardRow => ({
    provider: row.provider,
    pricingScope: row.pricing_scope,
    modelKey: row.model_key,
    tier: row.tier,
    inputCreditsPerMtok: Number(row.input_credits_per_mtok),
    outputCreditsPerMtok: Number(row.output_credits_per_mtok),
    cacheReadCreditsPerMtok: Number(row.cache_read_credits_per_mtok),
    cacheWriteCreditsPerMtok: Number(row.cache_write_credits_per_mtok),
    effectiveFrom: row.effective_from,
});

export class AiCreditRateCardModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    async getAll(): Promise<AiCreditRateCardRow[]> {
        const rows = await this.database<DbAiCreditRateCard>(
            AiCreditRateCardTableName,
        )
            .select('*')
            .orderBy([
                'provider',
                'pricing_scope',
                'model_key',
                'effective_from',
            ]);
        return rows.map(toRateCardRow);
    }
}
