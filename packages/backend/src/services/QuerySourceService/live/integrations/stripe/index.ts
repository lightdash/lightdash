import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { stripeConnection } from './connection';
import { stripeModel } from './model';
import { stripeQuery } from './query';
import { stripeSpec } from './spec';

export const stripeIntegration = defineLiveIntegration({
    connector: ApiConnectorType.STRIPE,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.STRIPE].messageLabel,
    kind: 'sql',
    connection: stripeConnection,
    model: stripeModel,
    query: stripeQuery,
    spec: stripeSpec,
});
