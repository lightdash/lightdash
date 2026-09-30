import {
    getAiCreditContractWindow,
    type AiCreditHold,
    type AiCreditPeriod,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiCreditContractsTableName,
    AiCreditHoldsTableName,
    type DbAiCreditHold,
} from '../database/entities/aiCredits';
import { type AiCreditContractWithAllowance } from './AiCreditContractModel';

type Dependencies = {
    database: Knex;
};

const SYSTEM_PLACED_BY = 'system';

const toHold = (row: DbAiCreditHold): AiCreditHold => ({
    uuid: row.ai_credit_hold_uuid,
    organizationUuid: row.organization_uuid,
    userUuid: row.user_uuid,
    contractUuid: row.ai_credit_contract_uuid,
    reason: row.reason,
    notes: row.notes,
    placedBy: row.placed_by,
    placedAt: row.placed_at,
    expiresAt: row.expires_at,
    releasedAt: row.released_at,
});

type HoldWithContractRow = DbAiCreditHold & {
    contract_starts_at: Date | null;
    contract_ends_at: Date | null;
    contract_reset_interval_months: number | null;
    contract_allowance_credits: string | null;
};

const matchesContract = (row: HoldWithContractRow, at: Date): boolean => {
    if (row.reason !== 'allowance_exhausted') return true;
    if (row.ai_credit_contract_uuid === null) return false;
    if (
        row.contract_starts_at === null ||
        row.contract_reset_interval_months === null
    ) {
        return false;
    }
    const window = getAiCreditContractWindow(
        {
            startsAt: row.contract_starts_at,
            endsAt: row.contract_ends_at,
            resetIntervalMonths: row.contract_reset_interval_months,
        },
        at,
    );
    return (
        window !== null &&
        window.periodStart.getTime() === row.window_start?.getTime() &&
        Number(row.contract_allowance_credits) ===
            Number(row.exhausted_allowance_credits)
    );
};

export class AiCreditHoldModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    // Includes released holds, so an operator's early release sticks for the rest of the window.
    async findAllowanceExhaustedHold(
        contract: AiCreditContractWithAllowance,
        window: AiCreditPeriod,
    ): Promise<AiCreditHold | undefined> {
        const row = await this.database(AiCreditHoldsTableName)
            .where({
                ai_credit_contract_uuid: contract.uuid,
                window_start: window.periodStart,
                // Numeric columns compare as strings through the pg driver.
                exhausted_allowance_credits: String(contract.allowanceCredits),
                reason: 'allowance_exhausted',
            })
            .first();
        return row ? toHold(row) : undefined;
    }

    /** Undefined when a concurrent call already placed the hold for this window. */
    async createAllowanceExhaustedHold(
        contract: AiCreditContractWithAllowance,
        window: AiCreditPeriod,
    ): Promise<AiCreditHold | undefined> {
        const [row] = await this.database(AiCreditHoldsTableName)
            .insert({
                organization_uuid: contract.organizationUuid,
                user_uuid: null,
                ai_credit_contract_uuid: contract.uuid,
                window_start: window.periodStart,
                exhausted_allowance_credits: contract.allowanceCredits,
                reason: 'allowance_exhausted',
                notes: null,
                placed_by: SYSTEM_PLACED_BY,
                expires_at: window.periodEnd,
            })
            .onConflict()
            .ignore()
            .returning('*');
        return row ? toHold(row) : undefined;
    }

    /**
     * One query, so it is cheap enough to run before every AI call. An allowance
     * hold only applies while the contract still has that allowance and window,
     * so raising the allowance or changing the contract lifts it straight away.
     */
    async findActive(
        organizationUuid: string,
        at: Date = new Date(),
    ): Promise<AiCreditHold[]> {
        const rows: HoldWithContractRow[] = await this.database(
            AiCreditHoldsTableName,
        )
            .leftJoin(
                AiCreditContractsTableName,
                `${AiCreditContractsTableName}.ai_credit_contract_uuid`,
                `${AiCreditHoldsTableName}.ai_credit_contract_uuid`,
            )
            .select(
                `${AiCreditHoldsTableName}.*`,
                `${AiCreditContractsTableName}.starts_at as contract_starts_at`,
                `${AiCreditContractsTableName}.ends_at as contract_ends_at`,
                `${AiCreditContractsTableName}.reset_interval_months as contract_reset_interval_months`,
                `${AiCreditContractsTableName}.allowance_credits as contract_allowance_credits`,
            )
            .where(
                `${AiCreditHoldsTableName}.organization_uuid`,
                organizationUuid,
            )
            .whereNull(`${AiCreditHoldsTableName}.released_at`)
            .where((builder) => {
                void builder
                    .whereNull(`${AiCreditHoldsTableName}.expires_at`)
                    .orWhere(`${AiCreditHoldsTableName}.expires_at`, '>', at);
            })
            .orderBy(`${AiCreditHoldsTableName}.placed_at`, 'desc');
        return rows.filter((row) => matchesContract(row, at)).map(toHold);
    }
}
