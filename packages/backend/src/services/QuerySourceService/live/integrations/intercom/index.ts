import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { intercomConnection } from './connection';
import { intercomModel } from './model';
import { intercomQuery } from './query';
import { intercomSpec } from './spec';

export const intercomIntegration = defineLiveIntegration({
    connector: ApiConnectorType.INTERCOM,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.INTERCOM].messageLabel,
    kind: 'records',
    connection: intercomConnection,
    model: intercomModel,
    query: intercomQuery,
    spec: intercomSpec,
});
