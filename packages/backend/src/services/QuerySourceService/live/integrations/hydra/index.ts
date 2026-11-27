import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { hydraConnection } from './connection';
import { hydraModel } from './model';
import { hydraQuery } from './query';
import { hydraSpec } from './spec';

/**
 * Hydra, the test integration: a normal integration run by the shared
 * engine, whose API is answered in-process (see `fake/server.ts`). Registered
 * only when LIVE_SOURCES_HYDRA_ENABLED is true.
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
