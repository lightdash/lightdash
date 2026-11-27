export type MetaAdsLevel = 'account' | 'campaign' | 'adset' | 'ad';

/** Coarsest first; a query reads at the finest level it groups by. */
export const META_ADS_LEVELS: readonly MetaAdsLevel[] = [
    'account',
    'campaign',
    'adset',
    'ad',
];

/** Which reporting level each ad object field needs. */
export const META_ADS_FIELD_LEVELS: Record<string, MetaAdsLevel> = {
    campaign_id: 'campaign',
    campaign_name: 'campaign',
    objective: 'campaign',
    adset_id: 'adset',
    adset_name: 'adset',
    ad_id: 'ad',
    ad_name: 'ad',
};

/** The Insights `filtering` field of each filterable ad object field. */
export const META_ADS_FILTER_FIELDS: Record<string, string> = {
    campaign_id: 'campaign.id',
    campaign_name: 'campaign.name',
    adset_id: 'adset.id',
    adset_name: 'adset.name',
    ad_id: 'ad.id',
    ad_name: 'ad.name',
};

/**
 * Values Meta reports per breakdown; the ones not listed in its combining
 * table (https://developers.facebook.com/docs/marketing-api/insights/breakdowns),
 * or that need an ad account opt-in such as `impression_device`, are left out.
 */
export const META_ADS_BREAKDOWNS = [
    'age',
    'gender',
    'country',
    'publisher_platform',
    'platform_position',
] as const;
