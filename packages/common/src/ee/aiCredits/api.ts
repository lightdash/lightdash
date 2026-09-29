import { type ApiSuccess } from '../../types/api/success';
import { type AiCreditHold, type AiCreditPeriod } from './types';

export type AiCreditUsageTotals = {
    credits: number;
    tokens: number;
    calls: number;
};

export type AiCreditUsageBreakdownRow = AiCreditUsageTotals & {
    key: string;
};

/** One entitlement covering now, with the billable credits used in its own period. */
export type AiCreditEntitlementUsage = AiCreditPeriod & {
    uuid: string;
    allowanceCredits: number | null;
    usedCredits: number;
};

export type AiCreditUsageSummary = {
    // The period the totals and breakdowns cover: the shortest entitlement
    // period covering now, or the calendar month when there is none.
    period: AiCreditPeriod;
    entitlements: AiCreditEntitlementUsage[];
    // Whether to say "credits": a licensed instance with an agreed entitlement.
    canShowCredits: boolean;
    // Billable calls: the figure compared to an allowance.
    billable: AiCreditUsageTotals;
    // Calls on the organization's own key, priced for comparison, never charged.
    selfManaged: AiCreditUsageTotals;
    // Background features and failed runs, never charged.
    excluded: AiCreditUsageTotals;
    // Tokens on models the rate card cannot price.
    unpricedTokens: number;
    // Billable calls only.
    byFeature: AiCreditUsageBreakdownRow[];
    byTier: AiCreditUsageBreakdownRow[];
    // Every priced call.
    byKeyOrigin: AiCreditUsageBreakdownRow[];
    activeHolds: AiCreditHold[];
};

export type ApiAiCreditUsageResponse = ApiSuccess<AiCreditUsageSummary>;
