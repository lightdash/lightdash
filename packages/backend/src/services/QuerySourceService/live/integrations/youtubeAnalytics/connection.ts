import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { readRule, type LiveConnection } from '../../sdk';
import { assertGoogleSignIn } from '../google/signIn';
import {
    YOUTUBE_ANALYTICS_ORIGIN,
    YOUTUBE_ANALYTICS_REPORTS_PATH,
} from './api';

const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.YOUTUBE_ANALYTICS];
const LABEL = CATALOG.messageLabel;

export const youtubeAnalyticsConnection: LiveConnection<ApiConnectorType.YOUTUBE_ANALYTICS> =
    {
        settings: CATALOG.settings,
        origins: [YOUTUBE_ANALYTICS_ORIGIN],
        // The query names the channel on every report, so the path can't narrow
        // a source to it.
        access: () => ({
            rules: [readRule('GET', YOUTUBE_ANALYTICS_REPORTS_PATH)],
        }),
        checkAuth: (connection) => assertGoogleSignIn(LABEL, connection),
        validate: ({ channelId }) => {
            if (!YOUTUBE_CHANNEL_ID.test(channelId)) {
                throw new ParameterError(
                    'The YouTube channel ID must look like UC followed by 22 characters',
                );
            }
        },
        describeTarget: ({ settings: { channelId }, targetLabel }) =>
            targetLabel
                ? `YouTube channel "${targetLabel}" (ID ${channelId})`
                : `YouTube channel ${channelId}`,
    };
