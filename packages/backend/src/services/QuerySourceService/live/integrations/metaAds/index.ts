import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { metaAdsConnection } from './connection';
import { metaAdsModel } from './model';
import { metaAdsQuery } from './query';
import { metaAdsSpec } from './spec';

export const metaAdsIntegration = defineLiveIntegration({
    connector: ApiConnectorType.META_ADS,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.META_ADS].messageLabel,
    kind: 'reports',
    connection: metaAdsConnection,
    model: metaAdsModel,
    query: metaAdsQuery,
    spec: metaAdsSpec,
});
