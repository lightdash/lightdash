import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { githubConnection } from './connection';
import { githubModel } from './model';
import { githubQuery } from './query';
import { githubSpec } from './spec';

export const githubIntegration = defineLiveIntegration({
    connector: ApiConnectorType.GITHUB,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.GITHUB].messageLabel,
    kind: 'records',
    connection: githubConnection,
    model: githubModel,
    query: githubQuery,
    spec: githubSpec,
});
