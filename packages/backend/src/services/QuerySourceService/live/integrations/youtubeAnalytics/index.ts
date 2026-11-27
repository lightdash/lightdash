import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { youtubeAnalyticsConnection } from './connection';
import { youtubeAnalyticsModel } from './model';
import { youtubeAnalyticsQuery } from './query';
import { youtubeAnalyticsSpec } from './spec';

export const youtubeAnalyticsIntegration = defineLiveIntegration({
    connector: ApiConnectorType.YOUTUBE_ANALYTICS,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.YOUTUBE_ANALYTICS]
        .messageLabel,
    kind: 'reports',
    connection: youtubeAnalyticsConnection,
    model: youtubeAnalyticsModel,
    query: youtubeAnalyticsQuery,
    spec: youtubeAnalyticsSpec,
});
