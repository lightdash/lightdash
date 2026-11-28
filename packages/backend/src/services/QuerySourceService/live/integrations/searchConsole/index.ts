import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { searchConsoleConnection } from './connection';
import { searchConsoleModel } from './model';
import { searchConsoleQuery } from './query';
import { searchConsoleSpec } from './spec';

export const searchConsoleIntegration = defineLiveIntegration({
    connector: ApiConnectorType.SEARCH_CONSOLE,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.SEARCH_CONSOLE]
        .messageLabel,
    kind: 'reports',
    connection: searchConsoleConnection,
    model: searchConsoleModel,
    query: searchConsoleQuery,
    spec: searchConsoleSpec,
});
