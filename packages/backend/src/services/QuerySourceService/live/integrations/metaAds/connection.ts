import {
    ApiConnectorType,
    getMetaAdsInsightsPath,
    LIVE_INTEGRATION_CATALOG,
    META_ADS_ORIGIN,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import { readRule, type LiveConnection, type LiveTestSummary } from '../../sdk';

// The setup test reads the account's spend over the last 7 days
const testResponseSchema = z.object({
    data: z.array(
        z.object({
            spend: z.string().optional(),
            account_name: z.string().optional(),
            account_currency: z.string().optional(),
        }),
    ),
});

const formatSpend = (spend: string, currency: string | undefined) => {
    const amount = Number(spend);
    if (!Number.isFinite(amount)) return spend;
    try {
        return new Intl.NumberFormat('en-US', {
            style: currency ? 'currency' : 'decimal',
            currency,
        }).format(amount);
    } catch {
        // An unknown currency code
        return `${amount.toLocaleString('en-US')} ${currency}`;
    }
};

export const summarizeMetaAdsTest = (
    body: unknown,
    { adAccountId }: { adAccountId: string },
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    const [row] = parsed.data.data;
    const account = row?.account_name
        ? `"${row.account_name}"`
        : `act_${adAccountId}`;
    return {
        summary: `Connected to ad account ${account}`,
        facts: [
            {
                label: 'Spend in the last 7 days',
                // Meta returns no row for an account that spent nothing
                value: row?.spend
                    ? formatSpend(row.spend, row.account_currency)
                    : 'None',
            },
        ],
    };
};

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.META_ADS];
const META_ADS_ACCOUNT_ID = /^\d{1,20}$/;

export const metaAdsConnection: LiveConnection<ApiConnectorType.META_ADS> = {
    settings: CATALOG.settings,
    origins: [META_ADS_ORIGIN],
    access: ({ adAccountId }) => ({
        rules: [readRule('GET', getMetaAdsInsightsPath(adAccountId))],
    }),
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Meta Ads connections authenticate with a system user access token',
            );
        }
    },
    validate: ({ adAccountId }) => {
        if (!META_ADS_ACCOUNT_ID.test(adAccountId)) {
            throw new ParameterError(
                'The Meta ad account ID must be a number, without the act_ prefix',
            );
        }
    },
    describeTarget: ({ settings: { adAccountId } }) =>
        `Meta Ads account ${adAccountId}`,
    summarizeTest: summarizeMetaAdsTest,
};
