import type {
    BaseTrack,
    DashboardView,
    SavedChartView,
    ViewSqlChart,
} from '../LightdashAnalytics';
import { buildEnvelope, type ProjectionResult } from './projection';
import type { CompactedStreamColumn } from './types';

export type ContentPageView = BaseTrack & {
    event: 'dashboard.view' | 'saved_chart.view' | 'sql_chart.view';
    userId: string;
    properties: {
        organizationId: string;
        projectId: string;
        contentView: {
            eventId: string;
            occurredAt: string;
            contentId: string;
            contentType: 'dashboard' | 'chart' | 'sql_chart';
            contentName: string;
            projectName: string;
            spaceId: string | null;
            spaceName: string | null;
            createdAt: string;
            isVerified: boolean | null;
            context: 'direct' | 'preview';
            actorType: 'user';
        };
    };
};
export type ContentViewEvent =
    | ContentPageView
    | DashboardView
    | SavedChartView
    | ViewSqlChart;

export const contentViewsColumns: CompactedStreamColumn[] = [
    ...[
        'event_name',
        'org_id',
        'user_id',
        'project_id',
        'event_id',
        'content_id',
        'content_type',
        'content_name',
        'project_name',
        'space_id',
        'space_name',
        'actor_type',
        'view_context',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    ...['event_ts', 'ingested_at', 'content_created_at'].map((name) => ({
        name,
        type: 'TIMESTAMP' as const,
    })),
    { name: 'schema_version', type: 'INTEGER' },
    { name: 'is_verified', type: 'BOOLEAN' },
    { name: 'is_qualifying', type: 'BOOLEAN' },
];

const projectContentView = (payload: ContentViewEvent): ProjectionResult => {
    const p = payload.properties;
    if (!p.organizationId) return null;
    const view = 'contentView' in p ? p.contentView : undefined;
    let legacyId: string | null = null;
    if ('dashboardId' in p) legacyId = p.dashboardId;
    else if ('savedChartId' in p) legacyId = p.savedChartId;
    else if ('chartId' in p) legacyId = p.chartId;
    const contentTypes = {
        'dashboard.view': 'dashboard',
        'saved_chart.view': 'chart',
        'sql_chart.view': 'sql_chart',
    };
    const envelope = buildEnvelope(payload, p.organizationId);
    return {
        stream: 'content_views',
        row: {
            ...envelope,
            event_ts: view?.occurredAt ?? envelope.event_ts,
            ingested_at: envelope.event_ts,
            project_id: p.projectId,
            event_id: view?.eventId ?? null,
            content_id: view?.contentId ?? legacyId,
            content_type: contentTypes[payload.event],
            content_name: view?.contentName ?? null,
            project_name: view?.projectName ?? null,
            space_id: view?.spaceId ?? null,
            space_name: view?.spaceName ?? null,
            content_created_at: view?.createdAt ?? null,
            is_verified: view?.isVerified ?? null,
            actor_type: view?.actorType ?? 'unknown',
            view_context:
                view?.context ??
                (payload.anonymousId === 'embed' ? 'embed' : 'unknown'),
            is_qualifying:
                !!view && view.context === 'direct' && !!payload.userId,
        },
    };
};

export const contentViewsProjections = {
    'dashboard.view': projectContentView,
    'saved_chart.view': projectContentView,
    'sql_chart.view': projectContentView,
};
