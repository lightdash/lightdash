import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { sentryConnection } from './connection';
import { sentryModel } from './model';
import { sentryQuery } from './query';
import { sentrySpec } from './spec';

export const sentryIntegration = defineLiveIntegration({
    connector: ApiConnectorType.SENTRY,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.SENTRY].messageLabel,
    kind: 'reports',
    connection: sentryConnection,
    model: sentryModel,
    query: sentryQuery,
    spec: sentrySpec,
});
