import { ApiConnectorType, ParameterError } from '@lightdash/common';
import { z } from 'zod';
import { getIsoDateInTimeZone } from '../apiDateRange';
import {
    API_SOURCE_RESPONSE_MAX_BYTES,
    assertApiSourceOrigin,
    type ApiSourceIntegration,
} from '../ApiSourceIntegration';
import { assertGoogleSignIn } from './googleSignIn';
import { compileYoutubeAnalyticsQuery } from './youtubeAnalyticsCompiler';
import {
    YOUTUBE_ANALYTICS_CAPABILITIES,
    YOUTUBE_ANALYTICS_ORIGIN,
    YOUTUBE_ANALYTICS_REPORTS_PATH,
    YOUTUBE_ANALYTICS_TIMEOUT_MS,
    YoutubeAnalyticsConnector,
} from './YoutubeAnalyticsConnector';
import {
    YOUTUBE_ANALYTICS_ACTIVITY_EXPLORE,
    YOUTUBE_ANALYTICS_SEMANTIC_LAYER_VERSION,
} from './youtubeAnalyticsSemanticLayer';

const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const LABEL = 'YouTube Analytics';

export const youtubeAnalyticsIntegration: ApiSourceIntegration<ApiConnectorType.YOUTUBE_ANALYTICS> =
    {
        connector: ApiConnectorType.YOUTUBE_ANALYTICS,
        settingsSchema: z.object({
            connector: z.literal(ApiConnectorType.YOUTUBE_ANALYTICS),
            channelId: z.string(),
        }),
        baseLayer: {
            baseVersion: YOUTUBE_ANALYTICS_SEMANTIC_LAYER_VERSION,
            capabilities: YOUTUBE_ANALYTICS_CAPABILITIES,
            definitions: [YOUTUBE_ANALYTICS_ACTIVITY_EXPLORE],
            plannedModelNames: [
                'demographics',
                'playlists',
                'revenue',
                'audience_retention',
            ],
        },
        // The connector names the channel on every report, so the path can't
        // narrow a source to it.
        getAccessRules: () => ({
            allowedPathPrefixes: [YOUTUBE_ANALYTICS_REPORTS_PATH],
            allowedMethods: ['GET'],
            allowedContentTypes: ['application/json'],
            timeoutMs: YOUTUBE_ANALYTICS_TIMEOUT_MS,
            responseMaxBytes: API_SOURCE_RESPONSE_MAX_BYTES,
        }),
        validateConnection: ({ apiSource, type, origin, oauthTokenUrl }) => {
            if (!YOUTUBE_CHANNEL_ID.test(apiSource.channelId)) {
                throw new ParameterError(
                    'The YouTube channel ID must look like UC followed by 22 characters',
                );
            }
            assertApiSourceOrigin(LABEL, origin, YOUTUBE_ANALYTICS_ORIGIN);
            assertGoogleSignIn(LABEL, { type, oauthTokenUrl });
        },
        createConnector: ({ channelId }, send) => ({
            connector: new YoutubeAnalyticsConnector({ channelId, send }),
        }),
        compile: ({ explore, metricQuery, timezone, now }) =>
            compileYoutubeAnalyticsQuery({
                explore,
                metricQuery,
                today: getIsoDateInTimeZone(now, timezone),
            }),
    };
