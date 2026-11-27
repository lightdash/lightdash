import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { mixpanelConnection } from './connection';
import { mixpanelModel } from './model';
import { mixpanelQuery } from './query';
import { mixpanelSpec } from './spec';

export const mixpanelIntegration = defineLiveIntegration({
    connector: ApiConnectorType.MIXPANEL,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.MIXPANEL].messageLabel,
    kind: 'reports',
    connection: mixpanelConnection,
    model: mixpanelModel,
    query: mixpanelQuery,
    spec: mixpanelSpec,
});
