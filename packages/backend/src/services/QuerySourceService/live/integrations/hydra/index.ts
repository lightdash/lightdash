import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { hydraConnection } from './connection';
import { hydraModel } from './model';
import { hydraQuery } from './query';
import { hydraSpec } from './spec';

/**
 * Hydra, an integration with seeded data and no vendor behind it: it
 * answers from rows it makes itself, so nothing is called. An organization
 * has it until its feature flag is turned off.
 */
export const hydraIntegration = defineLiveIntegration({
    connector: ApiConnectorType.HYDRA,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.HYDRA].messageLabel,
    kind: 'reports',
    connection: hydraConnection,
    model: hydraModel,
    query: hydraQuery,
    spec: hydraSpec,
});
