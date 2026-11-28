import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { linkedInAdsConnection } from './connection';
import { linkedInAdsModel } from './model';
import { linkedInAdsQuery } from './query';
import { linkedInAdsSpec } from './spec';

export const linkedInAdsIntegration = defineLiveIntegration({
    connector: ApiConnectorType.LINKEDIN_ADS,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.LINKEDIN_ADS].messageLabel,
    kind: 'reports',
    connection: linkedInAdsConnection,
    model: linkedInAdsModel,
    query: linkedInAdsQuery,
    spec: linkedInAdsSpec,
});
