import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { salesforceConnection } from './connection';
import { salesforceModel } from './model';
import { salesforceQuery } from './query';
import { salesforceSpec } from './spec';

export const salesforceIntegration = defineLiveIntegration({
    connector: ApiConnectorType.SALESFORCE,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.SALESFORCE].messageLabel,
    kind: 'records',
    connection: salesforceConnection,
    model: salesforceModel,
    query: salesforceQuery,
    spec: salesforceSpec,
});
