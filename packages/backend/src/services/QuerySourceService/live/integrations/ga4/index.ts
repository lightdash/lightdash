import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { ga4Connection } from './connection';
import { ga4Model } from './model';
import { ga4Query } from './query';
import { ga4Spec } from './spec';

export const ga4Integration = defineLiveIntegration({
    connector: ApiConnectorType.GA4,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.GA4].messageLabel,
    kind: 'reports',
    connection: ga4Connection,
    model: ga4Model,
    query: ga4Query,
    spec: ga4Spec,
});
