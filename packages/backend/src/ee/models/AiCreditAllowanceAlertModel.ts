import {
    type AiCreditAllowanceAlertRecord,
    type AiCreditAllowanceAlertThreshold,
    type AiCreditPeriod,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiCreditAllowanceAlertsTableName,
    type DbAiCreditAllowanceAlert,
} from '../database/entities/aiCredits';
import { type AiCreditContractWithAllowance } from './AiCreditContractModel';

type Dependencies = {
    database: Knex;
};

export type AiCreditAllowanceAlert = AiCreditAllowanceAlertRecord & {
    uuid: string;
    organizationUuid: string;
    contractUuid: string;
    windowStart: Date;
    usedCredits: number;
    reachedAt: Date;
    deliveredAt: Date | null;
};

const toAlert = (row: DbAiCreditAllowanceAlert): AiCreditAllowanceAlert => ({
    uuid: row.ai_credit_allowance_alert_uuid,
    organizationUuid: row.organization_uuid,
    contractUuid: row.ai_credit_contract_uuid,
    windowStart: row.window_start,
    thresholdPercent: row.threshold_percent,
    allowanceCredits: Number(row.allowance_credits),
    usedCredits: Number(row.used_credits),
    reachedAt: row.reached_at,
    deliveredAt: row.delivered_at,
});

export class AiCreditAllowanceAlertModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    async findForWindow(
        contract: AiCreditContractWithAllowance,
        window: AiCreditPeriod,
    ): Promise<AiCreditAllowanceAlert[]> {
        const rows = await this.database(
            AiCreditAllowanceAlertsTableName,
        ).where({
            ai_credit_contract_uuid: contract.uuid,
            window_start: window.periodStart,
        });
        return rows.map(toAlert);
    }

    /** Returns only the thresholds this call recorded; a concurrent call may have recorded the rest. */
    async recordReached(
        contract: AiCreditContractWithAllowance,
        window: AiCreditPeriod,
        thresholds: AiCreditAllowanceAlertThreshold[],
        usedCredits: number,
    ): Promise<AiCreditAllowanceAlert[]> {
        if (thresholds.length === 0) return [];
        const rows = await this.database(AiCreditAllowanceAlertsTableName)
            .insert(
                thresholds.map((threshold) => ({
                    organization_uuid: contract.organizationUuid,
                    ai_credit_contract_uuid: contract.uuid,
                    window_start: window.periodStart,
                    threshold_percent: threshold,
                    allowance_credits: contract.allowanceCredits,
                    used_credits: usedCredits,
                })),
            )
            .onConflict()
            .ignore()
            .returning('*');
        return rows.map(toAlert);
    }

    async rearm(
        contract: AiCreditContractWithAllowance,
        window: AiCreditPeriod,
        thresholds: AiCreditAllowanceAlertThreshold[],
    ): Promise<void> {
        if (thresholds.length === 0) return;
        await this.database(AiCreditAllowanceAlertsTableName)
            .where({
                ai_credit_contract_uuid: contract.uuid,
                window_start: window.periodStart,
            })
            .whereIn('threshold_percent', thresholds)
            .delete();
    }

    async carryOver(
        contract: AiCreditContractWithAllowance,
        window: AiCreditPeriod,
        thresholds: AiCreditAllowanceAlertThreshold[],
    ): Promise<void> {
        if (thresholds.length === 0) return;
        await this.database(AiCreditAllowanceAlertsTableName)
            .where({
                ai_credit_contract_uuid: contract.uuid,
                window_start: window.periodStart,
            })
            .whereIn('threshold_percent', thresholds)
            .update({ allowance_credits: contract.allowanceCredits });
    }

    async findUndelivered(limit: number): Promise<AiCreditAllowanceAlert[]> {
        const rows = await this.database(AiCreditAllowanceAlertsTableName)
            .whereNull('delivered_at')
            .orderBy('reached_at', 'asc')
            .limit(limit);
        return rows.map(toAlert);
    }

    async markDelivered(
        alertUuids: string[],
        at: Date = new Date(),
    ): Promise<void> {
        if (alertUuids.length === 0) return;
        await this.database(AiCreditAllowanceAlertsTableName)
            .whereIn('ai_credit_allowance_alert_uuid', alertUuids)
            .update({ delivered_at: at });
    }
}
