import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { attioConnection } from './connection';
import { attioModel } from './model';
import { attioQuery } from './query';
import { attioSpec } from './spec';

export const attioIntegration = defineLiveIntegration({
    connector: ApiConnectorType.ATTIO,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.ATTIO].messageLabel,
    kind: 'records',
    connection: attioConnection,
    model: attioModel,
    query: attioQuery,
    spec: attioSpec,
});
