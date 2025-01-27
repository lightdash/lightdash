import { type TokenUsage } from '@langchain/core/language_models/base';
import { DashboardFilterInteractivityOptions } from '@lightdash/common';
import { Track as AnalyticsTrack } from '@rudderstack/rudder-sdk-node';

type BaseTrack = Omit<AnalyticsTrack, 'context'>;

export type EmbedDashboardViewed = BaseTrack & {
    event: 'embed_dashboard.viewed';
    properties: {
        organizationId: string;
        projectId: string;
        dashboardId: string;
        externalId: string;
        context: 'preview' | 'production';
        dashboardFiltersInteractivity?: DashboardFilterInteractivityOptions;
        canExportCsv?: boolean;
        canExportImages?: boolean;
    };
};

export type EmbedQueryViewed = BaseTrack & {
    event: 'embed_query.executed';
    properties: {
        organizationId: string;
        projectId: string;
        dashboardId: string;
        chartId: string;
        externalId: string;
    };
};

export type DashboardSummaryCreated = BaseTrack & {
    event: 'ai.dashboard_summary.executed';
    properties: {
        openAIModelName: string;
        organizationId: string;
        projectId: string;
        dashboardId: string;
        dashboardSummaryUuid: string;
        // Track the metadata of the request and response
        context?: string | null;
        responseSize: number; // length in chars
        tokenUsage?: TokenUsage;
        // Track how long is taking to get the response
        timeGetCharts: number;
        timeOpenAi: number;
        timeTotal: number;
    };
};

export type DashboardSummaryViewed = BaseTrack & {
    event: 'ai.dashboard_summary.viewed';
    properties: {
        organizationId: string;
        projectId: string;
        dashboardId: string;
        dashboardSummaryUuid: string;
    };
};

// SCIM events

export type ScimAccessTokenAuthenticationEvent = BaseTrack & {
    event: 'scim_access_token.authenticated';
    userId?: undefined;
    anonymousId: string;
    properties: {
        organizationId: string;
        requestMethod: string;
        requestPath: string;
        requestRoutePath: string;
    };
};

export type ScimAccessTokenEvent = BaseTrack & {
    event:
        | 'scim_access_token.created'
        | 'scim_access_token.deleted'
        | 'scim_access_token.rotated';
    userId: string;
    properties: {
        organizationId: string;
    };
};
