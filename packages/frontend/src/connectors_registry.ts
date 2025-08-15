export const CONNECTORS_REGISTRY = {
  shopify: {
    key: 'shopify',
    name: 'Shopify',
    icon: '/logos/shopify.svg',
    preFields: ['shop_url'],
    postConfig: null,
    optionsEndpoint: null,
  },
  ga: {
    key: 'ga',
    name: 'Google Analytics',
    icon: '/logos/google-analytics.svg',
    preFields: [],

    postConfig: 'ga_property',
    // optionsEndpoint: '/api/connectors/google_analytics/properties',
    // ingestEndpoint: '/api/connectors/google_analytics/ingest',
  },
} as const;
