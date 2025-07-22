import { type TokenUsage } from '@langchain/core/language_models/base';
import { DashboardFilterInteractivityOptions } from '@lightdash/common';
import { Track as AnalyticsTrack } from '@rudderstack/rudder-sdk-node';

type BaseTrack = Omit<AnalyticsTrack, 'context'>;

export type EmbedDashboardViewed = BaseTrack & {
    event: 'embed_dashboard.viewed';
    properties: {
        projectId: string;
        dashboardId: string;
        context: 'preview' | 'production';
        dashboardFiltersInteractivity?: DashboardFilterInteractivityOptions;
        canExportCsv?: boolean;
        canExportImages?: boolean;
        canExportPagePdf: boolean;
        canDateZoom?: boolean;
    };
};

export type EmbedQueryViewed = BaseTrack & {
    event: 'embed_query.executed';
    properties: {
        projectId: string;
        dashboardId: string;
        chartId: string;
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

export type CustomVizGenerated = BaseTrack & {
    event: 'ai.custom_viz.generated';
    properties: {
        organizationId: string;
        projectId: string;
        // Track the metadata of the request and response
        prompt: string; // the prompt used to generate the custom viz
        responseSize: number; // length in chars
        tokenUsage?: TokenUsage;
        // Track how long is taking to get the response
        timeOpenAi: number;
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
