import { type ModelMaterializationStatus } from '@lightdash/common';
import { type Knex } from 'knex';

const live: ModelMaterializationStatus = {
    state: 'live',
    servingCopy: false,
    asOf: null,
    rowCount: null,
    maxRows: null,
    byteCount: null,
    nextRefresh: null,
    failureReason: null,
};

type StatusRow = {
    name: string;
    max_rows: number;
    active: boolean;
    compatible: boolean | null;
    revision_matches: boolean;
    source_read_at: Date | null;
    queued_refresh: boolean;
    row_count: number | null;
    byte_count: string | null;
    last_status: string | null;
    failure_reason: string | null;
};

function buildFailure(row: StatusRow): string {
    if (row.failure_reason === 'row_limit')
        return `The source exceeded the row limit of ${row.max_rows}.`;
    if (row.failure_reason === 'unsupported_type')
        return 'The source contains an unsupported column type.';
    return 'The last build failed. Check the source before refreshing.';
}

export class ModelMaterializationStatusModel {
    constructor(private readonly database: Knex) {}

    private async rows(projectUuid: string, modelName: string | null) {
        const { rows } = await this.database.raw<{ rows: StatusRow[] }>(
            `SELECT d.name, c.max_rows, c.active_generation_uuid IS NOT NULL AS active,
                    r.name = d.name AND s.project_uuid = d.project_uuid AND r.document_version = d.document_version
                      AND r.content_after IS NOT DISTINCT FROM d.content AS revision_matches,
                    g.status = 'ready' AND g.object_key <> '' AND g.policy_epoch = c.policy_epoch
                      AND g.compatibility_fingerprint = c.compatibility_fingerprint
                      AND g.build_fingerprint = c.build_fingerprint AS compatible,
                    g.source_read_at, g.row_count, g.byte_count, latest.status AS last_status, latest.failure_reason,
                    CASE WHEN ?::text IS NOT NULL THEN EXISTS (
                        SELECT 1 FROM graphile_worker.jobs j
                        WHERE j.task_identifier = 'materializeModel'
                          AND (j.locked_at IS NOT NULL OR j.attempts < j.max_attempts)
                          AND j.payload->>'configUuid' = c.config_uuid::text
                          AND j.payload->>'revisionUuid' = c.desired_revision_uuid::text
                          AND j.payload->>'policyEpoch' = c.policy_epoch::text
                          AND j.payload->>'manualRequestUuid' IS NOT NULL
                          AND NOT EXISTS (
                              SELECT 1 FROM model_materialization_generations attempted
                              WHERE attempted.manual_request_uuid = (j.payload->>'manualRequestUuid')::uuid
                              AND attempted.config_uuid = c.config_uuid
                          )
                    ) ELSE false END AS queued_refresh
               FROM model_materialization_configs c
               JOIN project_model_documents d ON d.project_model_document_uuid = c.document_uuid
               JOIN project_model_revisions r ON r.project_model_revision_uuid = c.desired_revision_uuid
               JOIN project_model_change_sets s ON s.project_model_change_set_uuid = r.project_model_change_set_uuid
               LEFT JOIN model_materialization_generations g ON g.config_uuid = c.config_uuid AND g.generation_uuid = c.active_generation_uuid
               LEFT JOIN LATERAL (
                   SELECT status, failure_reason FROM model_materialization_generations
                    WHERE config_uuid = c.config_uuid AND revision_uuid = c.desired_revision_uuid AND policy_epoch = c.policy_epoch
                    ORDER BY lease_expires_at DESC LIMIT 1
               ) latest ON true
               WHERE d.project_uuid = ? AND (?::text IS NULL OR d.name = ?)
               ORDER BY d.name`,
            [modelName, projectUuid, modelName, modelName],
        );
        return rows;
    }

    async list(projectUuid: string) {
        const rows = await this.rows(projectUuid, null);
        return {
            models: rows
                .filter((row) => row.revision_matches && row.compatible)
                .map((row) => row.name),
        };
    }

    async get(
        projectUuid: string,
        modelName: string,
    ): Promise<ModelMaterializationStatus> {
        const [row] = await this.rows(projectUuid, modelName);
        if (!row) return live;
        let failureReason: string | null = null;
        const failure = row.last_status === 'failed';
        const blocked =
            !row.revision_matches || (row.active && !row.compatible);
        const servingCopy = row.revision_matches && row.compatible === true;
        let state: ModelMaterializationStatus['state'] = 'preparing';
        if (blocked) {
            state = 'blocked';
            failureReason = 'The copy does not match the published model.';
        } else if (row.queued_refresh || row.last_status === 'building')
            state = 'preparing';
        else if (failure) {
            state = 'blocked';
            failureReason = buildFailure(row);
        } else if (servingCopy) state = 'materialized';
        return {
            state,
            servingCopy,
            maxRows: row.max_rows,
            rowCount: servingCopy ? row.row_count : null,
            byteCount:
                servingCopy && row.byte_count !== null
                    ? Number(row.byte_count)
                    : null,
            asOf: servingCopy
                ? (row.source_read_at?.toISOString() ?? null)
                : null,
            nextRefresh: null,
            failureReason,
        };
    }
}
