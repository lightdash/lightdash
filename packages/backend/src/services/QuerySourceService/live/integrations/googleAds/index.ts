import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { googleAdsConnection } from './connection';
import { googleAdsModel } from './model';
import { googleAdsQuery } from './query';
import { googleAdsSpec } from './spec';

export const googleAdsIntegration = defineLiveIntegration({
    connector: ApiConnectorType.GOOGLE_ADS,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.GOOGLE_ADS].messageLabel,
    kind: 'reports',
    connection: googleAdsConnection,
    model: googleAdsModel,
    query: googleAdsQuery,
    spec: googleAdsSpec,
});
