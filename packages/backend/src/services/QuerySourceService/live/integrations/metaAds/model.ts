import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
} from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    NON_ADDITIVE,
    ratio,
    type LiveExploreDefinition,
    type LiveModel,
    type NamedLiveExploreDefinition,
} from '../../sdk';
import { META_ADS_DEFAULT_DAYS } from './api';

export const META_ADS_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
];

export const META_ADS_ID_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const META_ADS_NAME_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
];

export const META_ADS_INSIGHTS_EXPLORE: NamedLiveExploreDefinition = {
    name: 'insights',
    label: 'Insights',
    description:
        'Facebook and Instagram ad performance for one Meta ad account: spend, reach, impressions, clicks and conversions, by campaign, ad set, ad, date, audience and placement. Dates are in the ad account time zone and money is in the ad account currency.',
    aiHint: `Without a Date filter the query reads the last ${META_ADS_DEFAULT_DAYS} days. Meta reports Age and Gender only on their own, without Country, Platform or Placement; and Country only without Platform or Placement. Add Platform whenever you use Placement. Reach and Frequency count each person once per row: never sum or average rows; split or filter the query instead. With a breakdown, Meta only reports reach for the last 13 months. Conversion metrics use Meta's default attribution (7-day click, 1-day view). Spend, reach and frequency are Meta estimates.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: META_ADS_DEFAULT_DAYS },
    incompatible: [
        {
            fields: ['age', 'gender'],
            with: ['country', 'publisher_platform', 'platform_position'],
            reason: 'Meta reports age and gender on their own, without location or placement.',
        },
        {
            fields: ['country'],
            with: ['publisher_platform', 'platform_position'],
            reason: 'Meta reports location on its own, without placement.',
        },
    ],
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'date_start',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: META_ADS_DATE_FILTERS,
            description: 'Day of the activity, in the ad account time zone.',
            aiHint: `Without a date filter the query reads the last ${META_ADS_DEFAULT_DAYS} days.`,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'date_month',
            apiName: 'date_start',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month of the activity, shown as its first day, in the ad account time zone.',
            aiHint: 'Filter Date, not this field, to choose the months.',
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'campaign_id',
            label: 'Campaign ID',
            type: DimensionType.STRING,
            filterOperators: META_ADS_ID_FILTERS,
            description: 'Meta campaign ID.',
        }),
        dimension({
            name: 'campaign_name',
            label: 'Campaign name',
            type: DimensionType.STRING,
            filterOperators: META_ADS_NAME_FILTERS,
            description: 'Name of the campaign.',
        }),
        dimension({
            name: 'objective',
            label: 'Campaign objective',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'What the campaign is set up to achieve, such as sales, leads or traffic.',
        }),
        dimension({
            name: 'adset_id',
            label: 'Ad set ID',
            type: DimensionType.STRING,
            filterOperators: META_ADS_ID_FILTERS,
            description: 'Meta ad set ID.',
        }),
        dimension({
            name: 'adset_name',
            label: 'Ad set name',
            type: DimensionType.STRING,
            filterOperators: META_ADS_NAME_FILTERS,
            description: 'Name of the ad set.',
        }),
        dimension({
            name: 'ad_id',
            label: 'Ad ID',
            type: DimensionType.STRING,
            filterOperators: META_ADS_ID_FILTERS,
            description: 'Meta ad ID.',
        }),
        dimension({
            name: 'ad_name',
            label: 'Ad name',
            type: DimensionType.STRING,
            filterOperators: META_ADS_NAME_FILTERS,
            description: 'Name of the ad.',
        }),
        dimension({
            name: 'age',
            label: 'Age',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Age range of the people reached, such as 25-34.',
            aiHint: 'Reported only on its own: not with Country, Platform or Placement.',
        }),
        dimension({
            name: 'gender',
            label: 'Gender',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Gender of the people reached.',
            aiHint: 'Reported only on its own: not with Country, Platform or Placement.',
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Two-letter code of the country of the people reached.',
            aiHint: 'Reported without Platform or Placement, and without Age or Gender.',
        }),
        dimension({
            name: 'publisher_platform',
            label: 'Platform',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Where the ad ran: facebook, instagram, messenger or audience_network.',
        }),
        dimension({
            name: 'platform_position',
            label: 'Placement',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Position within the platform, such as feed or story.',
            aiHint: 'Add Platform too: Meta reports placements per platform.',
        }),
    ],
    // Additivity follows Meta's Insights docs
    // (https://developers.facebook.com/docs/marketing-api/insights): spend,
    // impressions, clicks and actions are counts, reach deduplicates people across
    // the rows of a report so it can't be rebuilt by summing them, and frequency
    // divides by reach. CTR and CPC recompute from their parts; CPM carries a
    // factor of 1,000 that a ratio can't express. Insights fields can't be
    // filtered at the row level the way dimensions can, so metrics take no
    // filter operators.
    metrics: [
        metric({
            name: 'spend',
            label: 'Spend',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Amount spent, in the ad account currency. Meta reports it as an estimate.',
            format: '#,##0.00',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'impressions',
            label: 'Impressions',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of times the ads were on screen.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'reach',
            label: 'Reach',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Estimated number of people who saw the ads at least once.',
            aiHint: 'Counts each person once per row: never sum rows. With a breakdown, only the last 13 months are reported.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'frequency',
            label: 'Frequency',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Average number of times each person saw the ads, estimated by Meta.',
            aiHint: 'Depends on reach: never sum or average rows.',
            format: '0.00',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'clicks',
            label: 'Clicks (all)',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of all clicks on the ads, including link clicks, likes, comments and shares.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'link_clicks',
            apiName: 'inline_link_clicks',
            label: 'Link clicks',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of clicks on links in the ads to destinations on or off Meta.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'ctr',
            label: 'Click-through rate (all)',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'All clicks as a share of impressions.',
            aiHint: 'A ratio: never sum or average rows.',
            format: '0.00%',
            aggregation: ratio('clicks', 'impressions'),
        }),
        metric({
            name: 'cpc',
            label: 'Cost per click (all)',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Average cost per click (all clicks), in the ad account currency.',
            aiHint: 'A ratio: never sum or average rows.',
            format: '#,##0.00',
            aggregation: ratio('spend', 'clicks'),
        }),
        metric({
            name: 'cpm',
            label: 'Cost per 1,000 impressions',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Average cost per 1,000 impressions, in the ad account currency.',
            aiHint: 'A ratio: never sum or average rows.',
            format: '#,##0.00',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'purchases',
            apiName: 'actions:omni_purchase',
            label: 'Purchases',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of purchases on the website, in the app and on Meta, attributed to the ads.',
            aiHint: "Uses Meta's default attribution (7-day click and 1-day view), which can differ from an ad set's own setting. Empty when Meta reports no value.",
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'purchase_value',
            apiName: 'action_values:omni_purchase',
            label: 'Purchase value',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Value of those purchases, in the ad account currency.',
            aiHint: "Uses Meta's default attribution (7-day click and 1-day view), which can differ from an ad set's own setting. Empty when Meta reports no value.",
            format: '#,##0.00',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'purchase_roas',
            apiName: 'purchase_roas:omni_purchase',
            label: 'Purchase ROAS',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Purchase value divided by spend (return on ad spend).',
            aiHint: "Uses Meta's default attribution (7-day click and 1-day view), which can differ from an ad set's own setting. Empty when Meta reports no value. A ratio: never sum or average rows.",
            format: '0.00',
            aggregation: ratio('purchase_value', 'spend'),
        }),
        metric({
            name: 'leads',
            apiName: 'actions:lead',
            label: 'Leads',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of leads from websites and Meta lead forms, attributed to the ads.',
            aiHint: "Uses Meta's default attribution (7-day click and 1-day view), which can differ from an ad set's own setting. Empty when Meta reports no value.",
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'landing_page_views',
            apiName: 'actions:landing_page_view',
            label: 'Landing page views',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of times a landing page loaded after someone clicked a link in the ad.',
            aiHint: "Uses Meta's default attribution (7-day click and 1-day view), which can differ from an ad set's own setting. Empty when Meta reports no value.",
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'adds_to_cart',
            apiName: 'actions:omni_add_to_cart',
            label: 'Adds to cart',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of adds to cart on the website, in the app and on Meta, attributed to the ads.',
            aiHint: "Uses Meta's default attribution (7-day click and 1-day view), which can differ from an ad set's own setting. Empty when Meta reports no value.",
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'checkouts_initiated',
            apiName: 'actions:omni_initiated_checkout',
            label: 'Checkouts initiated',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of checkouts started on the website, in the app and on Meta, attributed to the ads.',
            aiHint: "Uses Meta's default attribution (7-day click and 1-day view), which can differ from an ad set's own setting. Empty when Meta reports no value.",
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'registrations_completed',
            apiName: 'actions:omni_complete_registration',
            label: 'Registrations completed',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of registrations completed on the website, in the app and on Meta, attributed to the ads.',
            aiHint: "Uses Meta's default attribution (7-day click and 1-day view), which can differ from an ad set's own setting. Empty when Meta reports no value.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const META_ADS_EXPLORES = [META_ADS_INSIGHTS_EXPLORE] as const;

export const metaAdsModel: LiveModel<ApiConnectorType.META_ADS> = {
    explores: META_ADS_EXPLORES,
};
