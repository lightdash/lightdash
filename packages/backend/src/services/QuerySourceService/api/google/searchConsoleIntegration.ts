import { ApiConnectorType, ParameterError } from '@lightdash/common';
import { z } from 'zod';
import { getIsoDateInTimeZone } from '../apiDateRange';
import {
    API_SOURCE_RESPONSE_MAX_BYTES,
    assertApiSourceOrigin,
    type ApiSourceIntegration,
} from '../ApiSourceIntegration';
import { assertGoogleSignIn } from './googleSignIn';
import { compileSearchConsoleQuery } from './searchConsoleCompiler';
import {
    SEARCH_CONSOLE_CAPABILITIES,
    SEARCH_CONSOLE_MAX_QUERY_ROWS,
    SEARCH_CONSOLE_ORIGIN,
    SEARCH_CONSOLE_SITES_PATH,
    SearchConsoleConnector,
} from './SearchConsoleConnector';
import {
    SEARCH_CONSOLE_PERFORMANCE_EXPLORE,
    SEARCH_CONSOLE_SEMANTIC_LAYER_VERSION,
} from './searchConsoleSemanticLayer';

const SEARCH_CONSOLE_TIMEOUT_MS = 30_000;
const SEARCH_CONSOLE_SITE =
    /^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s/?#]+\/[^\s?#]*)$/i;
// Search Console reports dates in Pacific Time, whatever the property.
const SEARCH_CONSOLE_TIME_ZONE = 'America/Los_Angeles';
const LABEL = 'Search Console';

export const searchConsoleIntegration: ApiSourceIntegration<ApiConnectorType.SEARCH_CONSOLE> =
    {
        connector: ApiConnectorType.SEARCH_CONSOLE,
        settingsSchema: z.object({
            connector: z.literal(ApiConnectorType.SEARCH_CONSOLE),
            siteUrl: z.string(),
        }),
        baseLayer: {
            baseVersion: SEARCH_CONSOLE_SEMANTIC_LAYER_VERSION,
            capabilities: SEARCH_CONSOLE_CAPABILITIES,
            definitions: [SEARCH_CONSOLE_PERFORMANCE_EXPLORE],
            plannedModelNames: ['search_appearance'],
        },
        // The token already limits the source to sites the account can read.
        getAccessRules: () => ({
            allowedPathPrefixes: [SEARCH_CONSOLE_SITES_PATH],
            allowedMethods: ['POST'],
            allowedContentTypes: ['application/json'],
            timeoutMs: SEARCH_CONSOLE_TIMEOUT_MS,
            responseMaxBytes: API_SOURCE_RESPONSE_MAX_BYTES,
        }),
        describeTarget: ({ apiSource: { siteUrl } }) =>
            `Search Console site ${siteUrl}`,
        validateConnection: ({ apiSource, type, origin, oauthTokenUrl }) => {
            if (!SEARCH_CONSOLE_SITE.test(apiSource.siteUrl)) {
                throw new ParameterError(
                    'The Search Console site must look like https://example.com/ or sc-domain:example.com',
                );
            }
            assertApiSourceOrigin(LABEL, origin, SEARCH_CONSOLE_ORIGIN);
            assertGoogleSignIn(LABEL, { type, oauthTokenUrl });
        },
        createConnector: ({ siteUrl }, send) => ({
            connector: new SearchConsoleConnector({ siteUrl, send }),
        }),
        compile: ({ explore, metricQuery, now }) =>
            compileSearchConsoleQuery({
                explore,
                metricQuery,
                today: getIsoDateInTimeZone(now, SEARCH_CONSOLE_TIME_ZONE),
                maxRows: SEARCH_CONSOLE_MAX_QUERY_ROWS,
            }),
    };
