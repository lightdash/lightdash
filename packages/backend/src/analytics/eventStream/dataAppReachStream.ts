import type { DataAppViewContext } from '@lightdash/common';
import type { BaseTrack } from '../LightdashAnalytics';
import { buildEnvelope, type ProjectionResult } from './projection';
import type { CompactedStreamColumn } from './types';

export type DataAppReachContext = {
    viewContext: DataAppViewContext | 'embed';
    isBuilder: boolean | null;
    creatorId: string | null;
    isShared: boolean;
    isPreviewProject: boolean;
};

export type DataAppReachEvent = BaseTrack & {
    event: 'data_app.reach';
    properties: DataAppReachContext & {
        organizationId: string;
        projectId: string;
        appUuid: string;
        version: number;
        eventId: string;
        viewId: string | null;
        stage: 'launched' | 'load' | 'sdk_ready' | 'render_error';
        outcome: 'served' | 'failed' | 'aborted' | null;
        isReload: boolean | null;
    };
};

export const dataAppReachColumns: CompactedStreamColumn[] = [
    ...[
        'event_name',
        'org_id',
        'project_id',
        'app_id',
        'user_id',
        'event_id',
        'view_id',
        'stage',
        'outcome',
        'view_context',
        'creator_id',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    { name: 'version', type: 'INTEGER' },
    { name: 'schema_version', type: 'INTEGER' },
    { name: 'event_ts', type: 'TIMESTAMP' },
    ...['is_builder', 'is_shared', 'is_preview_project', 'is_reload'].map(
        (name) => ({ name, type: 'BOOLEAN' as const }),
    ),
];

export const dataAppReachProjections = {
    'data_app.reach': (payload: DataAppReachEvent): ProjectionResult => {
        const p = payload.properties;
        if (!p.organizationId) return null;
        return {
            stream: 'data_app_reach_events',
            row: {
                ...buildEnvelope(payload, p.organizationId),
                project_id: p.projectId,
                app_id: p.appUuid,
                version: p.version,
                event_id: p.eventId,
                view_id: p.viewId,
                stage: p.stage,
                outcome: p.outcome,
                view_context: p.viewContext,
                creator_id: p.creatorId,
                is_builder: p.isBuilder,
                is_shared: p.isShared,
                is_preview_project: p.isPreviewProject,
                is_reload: p.isReload,
            },
        };
    },
};
