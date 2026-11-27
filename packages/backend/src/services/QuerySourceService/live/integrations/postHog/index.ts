import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { postHogConnection } from './connection';
import { postHogModel } from './model';
import { postHogQuery } from './query';
import { postHogSpec } from './spec';

export const postHogIntegration = defineLiveIntegration({
    connector: ApiConnectorType.POSTHOG,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.POSTHOG].messageLabel,
    kind: 'sql',
    connection: postHogConnection,
    model: postHogModel,
    query: postHogQuery,
    spec: postHogSpec,
});
