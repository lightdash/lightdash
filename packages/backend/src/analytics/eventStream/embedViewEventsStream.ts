import type { CapturedEmbedDashboardView } from './contentViewsStream';
import {
    embeddedUsageColumns,
    embeddedUsageFields,
} from './embeddedUsageColumns';
import { buildEnvelope, type ProjectionResult } from './projection';
import type { CompactedStreamColumn } from './types';

export const embedViewEventsColumns: CompactedStreamColumn[] = [
    ...[
        'event_name',
        'event_id',
        'org_id',
        'project_id',
        'project_name',
        'content_id',
        'content_type',
        'content_name',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    ...embeddedUsageColumns,
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'ingested_at', type: 'TIMESTAMP' },
    { name: 'schema_version', type: 'INTEGER' },
];

export const projectEmbedView = (
    payload: CapturedEmbedDashboardView,
): ProjectionResult => {
    const { contentView, embeddedUsage, organizationId, projectId } =
        payload.properties;
    if (
        !embeddedUsage ||
        !organizationId ||
        !projectId ||
        contentView?.context !== 'embed' ||
        !contentView.eventId ||
        !contentView.contentId
    ) {
        return null;
    }
    const { user_id: _userId, ...envelope } = buildEnvelope(
        payload,
        organizationId,
    );
    return {
        stream: 'embed_view_events',
        row: {
            ...envelope,
            event_id: contentView.eventId,
            event_ts: contentView.occurredAt,
            ingested_at: envelope.event_ts,
            project_id: projectId,
            project_name: contentView.projectName,
            content_id: contentView.contentId,
            content_type: contentView.contentType,
            content_name: contentView.contentName,
            ...embeddedUsageFields(embeddedUsage),
        },
    };
};
