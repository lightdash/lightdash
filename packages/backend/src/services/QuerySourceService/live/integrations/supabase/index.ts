import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { supabaseConnection } from './connection';
import { supabaseModel } from './model';
import { supabaseQuery } from './query';
import { supabaseSpec } from './spec';

export const supabaseIntegration = defineLiveIntegration({
    connector: ApiConnectorType.SUPABASE,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.SUPABASE].messageLabel,
    kind: 'records',
    connection: supabaseConnection,
    model: supabaseModel,
    query: supabaseQuery,
    spec: supabaseSpec,
});
