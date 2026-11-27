import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { amplitudeConnection } from './connection';
import { amplitudeModel } from './model';
import { amplitudeQuery } from './query';
import { amplitudeSpec } from './spec';

export const amplitudeIntegration = defineLiveIntegration({
    connector: ApiConnectorType.AMPLITUDE,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.AMPLITUDE].messageLabel,
    kind: 'reports',
    connection: amplitudeConnection,
    model: amplitudeModel,
    query: amplitudeQuery,
    spec: amplitudeSpec,
});
