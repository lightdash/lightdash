import { type ApiSuccess } from '../../types/api/success';
import { type AiBillableFeature } from './billable';
import {
    type AiCreditContract,
    type AiCreditHold,
    type AiCreditPeriod,
} from './types';

export type AiCreditUsageTotals = {
    credits: number;
    tokens: number;
    calls: number;
};

export type AiCreditUsageBreakdownRow = AiCreditUsageTotals & {
    key: string;
};

export type AiCreditUsageSummary = {
    // The contract window containing now, or the calendar month without a contract.
    period: AiCreditPeriod;
    contract: Omit<AiCreditContract, 'organizationUuid'> | null;
    // Whether to say "credits": the organization has a contract in force.
    canShowCredits: boolean;
    // Billable calls: the figure compared to the contract's allowance.
    billable: AiCreditUsageTotals;
    // Completed billable-feature calls on the organization's own key, priced for comparison, never charged.
    selfManaged: AiCreditUsageTotals;
    // Background features and failed runs on either key, never charged.
    excluded: AiCreditUsageTotals;
    // Tokens on models the rate card cannot price.
    unpricedTokens: number;
    // Billable calls only.
    byFeature: AiCreditUsageBreakdownRow[];
    byTier: AiCreditUsageBreakdownRow[];
    byChannel: AiCreditUsageBreakdownRow[];
    // Every priced call.
    byKeyOrigin: AiCreditUsageBreakdownRow[];
    activeHolds: AiCreditHold[];
};

export type ApiAiCreditUsageResponse = ApiSuccess<AiCreditUsageSummary>;

// Billable credits for one feature over the period.
export type AiCreditDailyUsageSeries = {
    feature: AiBillableFeature;
    credits: number;
};

export type AiCreditDailyUsageDay = {
    // UTC calendar date, YYYY-MM-DD.
    date: string;
    // Billable credits per series, in the same order as `series`.
    credits: number[];
};

export type AiCreditDailyUsage = {
    period: AiCreditPeriod;
    // Largest first.
    series: AiCreditDailyUsageSeries[];
    // Every day of the period, including days without usage.
    days: AiCreditDailyUsageDay[];
};

export type ApiAiCreditDailyUsageResponse = ApiSuccess<AiCreditDailyUsage>;
