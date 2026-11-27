import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { hubspotConnection } from './connection';
import { hubspotModel } from './model';
import { hubspotQuery } from './query';
import { hubspotSpec } from './spec';

export const hubspotIntegration = defineLiveIntegration({
    connector: ApiConnectorType.HUBSPOT,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.HUBSPOT].messageLabel,
    kind: 'records',
    connection: hubspotConnection,
    model: hubspotModel,
    query: hubspotQuery,
    spec: hubspotSpec,
});
