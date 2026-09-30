import { type AiCreditContract } from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiCreditContractsTableName,
    type DbAiCreditContract,
} from '../database/entities/aiCredits';

type Dependencies = {
    database: Knex;
};

export type AiCreditContractWithAllowance = AiCreditContract & {
    allowanceCredits: number;
};

const toContract = (row: DbAiCreditContract): AiCreditContract => ({
    uuid: row.ai_credit_contract_uuid,
    organizationUuid: row.organization_uuid,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    resetIntervalMonths: row.reset_interval_months,
    allowanceCredits:
        row.allowance_credits === null ? null : Number(row.allowance_credits),
});

export const hasAllowance = (
    contract: AiCreditContract,
): contract is AiCreditContractWithAllowance =>
    contract.allowanceCredits !== null;

export class AiCreditContractModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    async find(
        organizationUuid: string,
    ): Promise<AiCreditContract | undefined> {
        const row = await this.database(AiCreditContractsTableName)
            .where({ organization_uuid: organizationUuid })
            .first();
        return row ? toContract(row) : undefined;
    }

    async findOrganizationUuidsResettingEvery(
        minimumMonths: number,
    ): Promise<string[]> {
        const rows = await this.database(AiCreditContractsTableName)
            .where('reset_interval_months', '>=', minimumMonths)
            .select('organization_uuid');
        return rows.map((row) => row.organization_uuid);
    }
}
