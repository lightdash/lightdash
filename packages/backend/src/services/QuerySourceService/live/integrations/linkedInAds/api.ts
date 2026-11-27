/**
 * adAnalytics reports IDs only. Names, statuses and types would need an
 * account-wide lookup on every query, so the explore has none.
 */
export const LINKEDIN_ADS_CAMPAIGN_COLUMNS = ['campaign.id'] as const;

export const LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS = [
    'campaignGroup.id',
] as const;

export const LINKEDIN_ADS_DATE_COLUMNS = ['day', 'month', 'year'] as const;

// adAnalytics takes 20 fields, and every query spends two on dateRange and
// pivotValues (https://learn.microsoft.com/linkedin/marketing/integrations/ads-reporting/ads-reporting)
export const LINKEDIN_ADS_MAX_METRICS = 18;

/** Days a query reads without a date filter. */
export const LINKEDIN_ADS_DEFAULT_DAYS = 28;
