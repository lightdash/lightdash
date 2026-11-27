import {
    ApiConnectorType,
    isSupabaseOrigin,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    SUPABASE_REST_PATH,
} from '@lightdash/common';
import { readRule, type LiveConnection } from '../../sdk';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.SUPABASE];

export const supabaseConnection: LiveConnection<ApiConnectorType.SUPABASE> = {
    settings: CATALOG.settings,
    origins: ['https://<project ref>.supabase.co'],
    // Custom domains and self-hosted Supabase serve the same Data API
    acceptsOrigin: isSupabaseOrigin,
    // GET on the Data API only reads: tables, views, and functions declared
    // stable or immutable. Writes need POST, PATCH or DELETE.
    access: () => ({
        rules: [readRule('GET', SUPABASE_REST_PATH)],
    }),
    checkAuth: ({ type }) => {
        if (type !== 'api_key') {
            throw new ParameterError(
                'Supabase live data sources sign in with a secret API key',
            );
        }
    },
    describeTarget: ({ settings: { table }, origin }) =>
        `Supabase table "${table}" in the project at ${origin}`,
};
