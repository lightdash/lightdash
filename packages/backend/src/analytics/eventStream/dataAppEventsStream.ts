import type {
    DataAppCreatedEvent,
    DataAppDeletedEvent,
    DataAppDownloadedEvent,
    DataAppDuplicatedEvent,
    DataAppIteratedEvent,
    DataAppPromotedEvent,
    DataAppUploadedEvent,
    DataAppVersionCancelledEvent,
    DataAppVersionCompletedEvent,
    DataAppVersionFailedEvent,
    DataAppVersionRestoredEvent,
    DataAppViewedEvent,
} from '../LightdashAnalytics';
import { buildEnvelope, type ProjectionResult } from './projection';
import type { CompactedStreamColumn } from './types';

export type DataAppStreamEvent =
    | DataAppViewedEvent
    | DataAppCreatedEvent
    | DataAppIteratedEvent
    | DataAppVersionCompletedEvent
    | DataAppVersionFailedEvent
    | DataAppVersionCancelledEvent
    | DataAppVersionRestoredEvent
    | DataAppDuplicatedEvent
    | DataAppDeletedEvent
    | DataAppPromotedEvent
    | DataAppUploadedEvent
    | DataAppDownloadedEvent;

export const dataAppEventsCompactedColumns: CompactedStreamColumn[] = [
    { name: 'event_name', type: 'VARCHAR' },
    { name: 'org_id', type: 'VARCHAR' },
    { name: 'user_id', type: 'VARCHAR' },
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'schema_version', type: 'INTEGER' },
    { name: 'project_id', type: 'VARCHAR' },
    { name: 'app_id', type: 'VARCHAR' },
    { name: 'version', type: 'INTEGER' },
    { name: 'coding_agent', type: 'VARCHAR' },
    { name: 'requested_model', type: 'VARCHAR' },
    { name: 'provider', type: 'VARCHAR' },
    { name: 'is_iteration', type: 'BOOLEAN' },
    { name: 'was_resumed', type: 'BOOLEAN' },
    { name: 'duration_ms', type: 'BIGINT' },
    { name: 'scheduler_wait_ms', type: 'BIGINT' },
    { name: 'outcome_stage', type: 'VARCHAR' },
];

const projectDataAppEvent = (payload: DataAppStreamEvent): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId) return null;
    const build =
        payload.event === 'data_app.created' ||
        payload.event === 'data_app.iterated' ||
        payload.event === 'data_app.version.completed' ||
        payload.event === 'data_app.version.failed'
            ? payload.properties
            : null;
    const outcome =
        payload.event === 'data_app.version.completed' ||
        payload.event === 'data_app.version.failed'
            ? payload.properties
            : null;
    let isIteration = outcome?.isIteration ?? null;
    if (payload.event === 'data_app.created') isIteration = false;
    if (payload.event === 'data_app.iterated') isIteration = true;
    let outcomeStage: string | null = null;
    if (payload.event === 'data_app.version.failed')
        outcomeStage = payload.properties.failureStage ?? null;
    if (payload.event === 'data_app.version.cancelled')
        outcomeStage = payload.properties.stageAtCancellation ?? null;
    return {
        stream: 'data_app_events',
        row: {
            ...buildEnvelope(payload, properties.organizationId),
            project_id: properties.projectId,
            app_id: properties.appUuid,
            version:
                payload.event === 'data_app.view' ||
                payload.event === 'data_app.duplicated' ||
                payload.event === 'data_app.deleted'
                    ? null
                    : payload.properties.version,
            coding_agent: build?.codingAgent ?? null,
            requested_model:
                build?.codingAgentModel ?? build?.claudeModel ?? null,
            provider: outcome?.claudeProvider ?? null,
            is_iteration: isIteration,
            was_resumed: outcome?.wasResumed ?? null,
            duration_ms: outcome?.totalDurationMs ?? null,
            scheduler_wait_ms: outcome?.schedulerWaitMs ?? null,
            outcome_stage: outcomeStage,
        },
    };
};

export const dataAppEventsProjections = {
    'data_app.view': projectDataAppEvent,
    'data_app.created': projectDataAppEvent,
    'data_app.iterated': projectDataAppEvent,
    'data_app.version.completed': projectDataAppEvent,
    'data_app.version.failed': projectDataAppEvent,
    'data_app.version.cancelled': projectDataAppEvent,
    'data_app.version.restored': projectDataAppEvent,
    'data_app.duplicated': projectDataAppEvent,
    'data_app.deleted': projectDataAppEvent,
    'data_app.promoted': projectDataAppEvent,
    'data_app.uploaded': projectDataAppEvent,
    'data_app.downloaded': projectDataAppEvent,
};
