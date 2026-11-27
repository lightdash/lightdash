import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { pylonConnection } from './connection';
import { pylonModel } from './model';
import { pylonQuery } from './query';
import { pylonSpec } from './spec';

export const pylonIntegration = defineLiveIntegration({
    connector: ApiConnectorType.PYLON,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.PYLON].messageLabel,
    kind: 'records',
    connection: pylonConnection,
    model: pylonModel,
    query: pylonQuery,
    spec: pylonSpec,
});
