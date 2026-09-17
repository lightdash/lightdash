import type { DownloadCsv } from '../LightdashAnalytics';
import { buildEnvelope, type ProjectionResult } from './projection';
import type { CompactedStreamColumn } from './types';

export const exportEventsCompactedColumns: CompactedStreamColumn[] = [
    { name: 'event_name', type: 'VARCHAR' },
    { name: 'org_id', type: 'VARCHAR' },
    { name: 'user_id', type: 'VARCHAR' },
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'schema_version', type: 'INTEGER' },
    { name: 'project_id', type: 'VARCHAR' },
    { name: 'format', type: 'VARCHAR' },
    { name: 'context', type: 'VARCHAR' },
    { name: 'job_id', type: 'VARCHAR' },
    { name: 'table_id', type: 'VARCHAR' },
    { name: 'num_rows', type: 'BIGINT' },
];

const projectExportEvent = (payload: DownloadCsv): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId) return null;
    return {
        stream: 'export_events',
        row: {
            ...buildEnvelope(payload, properties.organizationId),
            project_id: properties.projectId,
            format: properties.fileType,
            context: properties.context ?? null,
            job_id: properties.jobId ?? null,
            table_id: properties.tableId ?? null,
            num_rows: properties.numRows ?? null,
        },
    };
};

export const exportEventsProjections = {
    'download_results.started': projectExportEvent,
    'download_results.completed': projectExportEvent,
    'download_results.error': projectExportEvent,
};
