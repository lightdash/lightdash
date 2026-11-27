import {
    ApiConnectorType,
    getSupabaseTablePath,
    isSupabaseOrigin,
    isSupabaseTableName,
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
    // GET only reads. Exact paths keep to the table list and the tables
    // discovered, never functions under /rpc/.
    access: (_settings, explores) => ({
        rules: [
            readRule('GET', SUPABASE_REST_PATH, { exact: true }),
            ...explores.flatMap(({ apiName }) =>
                apiName !== undefined && isSupabaseTableName(apiName)
                    ? [
                          readRule('GET', getSupabaseTablePath(apiName), {
                              exact: true,
                              entry: apiName,
                          }),
                      ]
                    : [],
            ),
        ],
    }),
    checkAuth: ({ type }) => {
        if (type !== 'api_key') {
            throw new ParameterError(
                'Supabase live data sources sign in with a secret API key',
            );
        }
    },
    describeTarget: ({ origin }) => `the Supabase project at ${origin}`,
};
