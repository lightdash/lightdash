/**
 * adAnalytics reports IDs only. Names, statuses and types would need an
 * account-wide lookup on every query, so the explore has none.
 */
export const LINKEDIN_ADS_CAMPAIGN_COLUMNS = ['campaign.id'] as const;

export const LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS = [
    'campaignGroup.id',
] as const;

export const LINKEDIN_ADS_DATE_COLUMNS = ['day', 'month', 'year'] as const;
