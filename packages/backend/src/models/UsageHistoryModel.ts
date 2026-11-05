import type { Knex } from 'knex';
import { UsageAdditionalHistoryModel } from './UsageAdditionalHistoryModel';
import { UsageLegacyHistoryModel } from './UsageLegacyHistoryModel';
import { UsageQueryHistoryModel } from './UsageQueryHistoryModel';

/** Database-only exports for the three recoverable history datasets. */
export class UsageHistoryModel {
    private readonly queries: UsageQueryHistoryModel;
    private readonly additional: UsageAdditionalHistoryModel;
    private readonly legacy: UsageLegacyHistoryModel;

    constructor(database: Knex) {
        this.queries = new UsageQueryHistoryModel(database);
        this.additional = new UsageAdditionalHistoryModel(database);
        this.legacy = new UsageLegacyHistoryModel(database);
    }

    getQueryJsonLines(org: string, before: string) {
        return this.queries.getJsonLines(org, before);
    }

    getAiUsageJsonLines(org: string, before: string) {
        return this.additional.getAiUsageJsonLines(org, before);
    }

    async *getActivityJsonLines(org: string, before: string) {
        yield* this.legacy.getJsonLines(org, before);
        yield* this.additional.getActivityJsonLines(org, before);
    }
}
