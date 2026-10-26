import type {
    AnalysisTarget,
    AnalysisTargetRef,
    DataAppAnalysisSource,
    DataAppDetectResult,
    DataAppInvestigateResult,
    DataAppPromptResult,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DataAppAnalysesTableName,
    DataAppAnalysisDailyCountersTableName,
    DataAppAnalysisRateCountersTableName,
    type DataAppAnalysisOperation,
    type DataAppSourceHash,
    type DbDataAppAnalysis,
    type DbDataAppAnalysisTarget,
} from '../database/entities/dataAppAnalyses';

type Dependencies = {
    database: Knex;
};

type CreateBase = {
    organizationUuid: string;
    projectUuid: string;
    target: AnalysisTargetRef;
    createdByUserUuid: string;
    sources: DataAppAnalysisSource[];
    instructions: string | null;
    modelId: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    latencyMs?: number | null;
};

const targetColumns = (target: AnalysisTargetRef): DbDataAppAnalysisTarget =>
    target.kind === 'app'
        ? {
              app_id: target.appUuid,
              app_version: target.appVersion,
              dashboard_uuid: null,
          }
        : {
              app_id: null,
              app_version: null,
              dashboard_uuid: target.dashboardUuid,
          };

// Filter on the set side only: the CHECK constraint guarantees the other
// target's columns are null, and knex renders explicit nulls as `= NULL`.
const targetWhere = (
    target: AnalysisTargetRef,
): Partial<DbDataAppAnalysisTarget> =>
    target.kind === 'app'
        ? { app_id: target.appUuid, app_version: target.appVersion }
        : { dashboard_uuid: target.dashboardUuid };

/** The uuid an analysis row or counter is keyed on, whatever the target. */
export const analysisTargetUuid = (target: AnalysisTargetRef): string =>
    target.kind === 'app' ? target.appUuid : target.dashboardUuid;

export const rowTarget = (row: DbDataAppAnalysisTarget): AnalysisTargetRef =>
    row.app_id !== null
        ? { kind: 'app', appUuid: row.app_id, appVersion: row.app_version }
        : { kind: 'dashboard', dashboardUuid: row.dashboard_uuid };

export type CreateDataAppAnalysis = CreateBase &
    (
        | {
              operation: 'detect';
              result: DataAppDetectResult;
              contentHash: string;
              sourceHashes: DataAppSourceHash[];
              reusedFromAnalysisUuid: string | null;
          }
        | {
              operation: 'investigate';
              result: DataAppInvestigateResult;
              parentAnalysisUuid: string;
              anomalyId: string;
              agentUuid: string;
              threadUuid: string;
          }
        | { operation: 'prompt'; result: DataAppPromptResult }
    );

export class DataAppAnalysisModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    async create(data: CreateDataAppAnalysis): Promise<DbDataAppAnalysis> {
        const [row] = await this.database(DataAppAnalysesTableName)
            .insert({
                organization_uuid: data.organizationUuid,
                project_uuid: data.projectUuid,
                ...targetColumns(data.target),
                created_by_user_uuid: data.createdByUserUuid,
                operation: data.operation,
                sources: JSON.stringify(data.sources),
                instructions: data.instructions,
                result: JSON.stringify(data.result),
                model_id: data.modelId,
                input_tokens: data.inputTokens ?? null,
                output_tokens: data.outputTokens ?? null,
                latency_ms: data.latencyMs ?? null,
                content_hash:
                    data.operation === 'detect' ? data.contentHash : null,
                source_hashes:
                    data.operation === 'detect'
                        ? JSON.stringify(data.sourceHashes)
                        : null,
                reused_from_analysis_uuid:
                    data.operation === 'detect'
                        ? data.reusedFromAnalysisUuid
                        : null,
                parent_analysis_uuid:
                    data.operation === 'investigate'
                        ? data.parentAnalysisUuid
                        : null,
                anomaly_id:
                    data.operation === 'investigate' ? data.anomalyId : null,
                agent_uuid:
                    data.operation === 'investigate' ? data.agentUuid : null,
                thread_uuid:
                    data.operation === 'investigate' ? data.threadUuid : null,
            })
            .returning('*');
        return row;
    }

    /**
     * Newest detection that read exactly this content. `userUuid` narrows to
     * the viewer's own rows; without it any viewer's row qualifies (identical
     * content means identical rows, so nothing leaks).
     */
    async findLatestDetectByHash(filter: {
        target: AnalysisTargetRef;
        contentHash: string;
        userUuid: string | null;
    }): Promise<(DbDataAppAnalysis & { operation: 'detect' }) | null> {
        const row = await this.database(DataAppAnalysesTableName)
            .where({
                ...targetWhere(filter.target),
                content_hash: filter.contentHash,
                operation: 'detect',
                ...(filter.userUuid
                    ? { created_by_user_uuid: filter.userUuid }
                    : {}),
            })
            .orderBy('created_at', 'desc')
            .first();
        return (
            (row as
                | (DbDataAppAnalysis & { operation: 'detect' })
                | undefined) ?? null
        );
    }

    /**
     * Points a detection at the queries the viewer has now. The rows are
     * identical (same content hash), only the query uuids moved.
     */
    async rebindSources(
        analysisUuid: string,
        data: {
            sources: DataAppAnalysisSource[];
            sourceHashes: DataAppSourceHash[];
            result: DataAppDetectResult;
        },
    ): Promise<void> {
        await this.database(DataAppAnalysesTableName)
            .where({ data_app_analysis_uuid: analysisUuid })
            .update({
                sources: JSON.stringify(data.sources),
                source_hashes: JSON.stringify(data.sourceHashes),
                result: JSON.stringify(data.result),
            });
    }

    /** Investigations of one detection, oldest first. */
    async findInvestigations(
        parentAnalysisUuid: string,
    ): Promise<(DbDataAppAnalysis & { operation: 'investigate' })[]> {
        const rows = await this.database(DataAppAnalysesTableName)
            .where({
                parent_analysis_uuid: parentAnalysisUuid,
                operation: 'investigate',
            })
            .orderBy('created_at', 'asc');
        return rows as (DbDataAppAnalysis & { operation: 'investigate' })[];
    }

    /** Scoped to the viewer and target so a foreign analysis id reads as absent. */
    async find(
        analysisUuid: string,
        target: { kind: AnalysisTarget; targetUuid: string },
        userUuid: string,
    ): Promise<DbDataAppAnalysis | null> {
        const row = await this.database(DataAppAnalysesTableName)
            .where({
                data_app_analysis_uuid: analysisUuid,
                [target.kind === 'app' ? 'app_id' : 'dashboard_uuid']:
                    target.targetUuid,
                created_by_user_uuid: userUuid,
            })
            .first();
        return row ?? null;
    }

    /**
     * Atomically bumps the viewer's counter for one operation in one minute
     * window and returns the new count. Shared across pods.
     */
    async incrementRateCounter(args: {
        /** App or dashboard uuid; the column keeps its original app name. */
        targetUuid: string;
        userUuid: string;
        operation: DataAppAnalysisOperation;
        windowStartedAt: Date;
    }): Promise<number> {
        const [row] = await this.database(DataAppAnalysisRateCountersTableName)
            .insert({
                app_id: args.targetUuid,
                user_uuid: args.userUuid,
                operation: args.operation,
                window_started_at: args.windowStartedAt,
                request_count: 1,
            })
            .onConflict([
                'app_id',
                'user_uuid',
                'operation',
                'window_started_at',
            ])
            .merge({
                request_count: this.database.raw(
                    `${DataAppAnalysisRateCountersTableName}.request_count + 1`,
                ) as unknown as number,
            })
            .returning('request_count');
        return row.request_count;
    }

    /** Bumps the org's counter for one operation on one UTC day. */
    async incrementDailyCounter(args: {
        organizationUuid: string;
        operation: DataAppAnalysisOperation;
        day: string;
    }): Promise<number> {
        const [row] = await this.database(DataAppAnalysisDailyCountersTableName)
            .insert({
                organization_uuid: args.organizationUuid,
                operation: args.operation,
                day: args.day,
                request_count: 1,
            })
            .onConflict(['organization_uuid', 'operation', 'day'])
            .merge({
                request_count: this.database.raw(
                    `${DataAppAnalysisDailyCountersTableName}.request_count + 1`,
                ) as unknown as number,
            })
            .returning('request_count');
        return row.request_count;
    }

    async deleteDailyCountersBefore(day: string): Promise<number> {
        return this.database(DataAppAnalysisDailyCountersTableName)
            .where('day', '<', day)
            .delete();
    }

    /**
     * Deletes one batch of analyses created before the cutoff, oldest first.
     * Investigations cascade from their detection; a reused detection's
     * back-reference is set null. Returns the number of rows deleted.
     */
    async deleteExpiredBatch(cutoff: Date, batchSize: number): Promise<number> {
        const expired = this.database(DataAppAnalysesTableName)
            .select('data_app_analysis_uuid')
            .where('created_at', '<', cutoff)
            .orderBy('created_at', 'asc')
            .limit(batchSize);
        return this.database(DataAppAnalysesTableName)
            .whereIn('data_app_analysis_uuid', expired)
            .delete();
    }

    async deleteRateCountersBefore(cutoff: Date): Promise<number> {
        return this.database(DataAppAnalysisRateCountersTableName)
            .where('window_started_at', '<', cutoff)
            .delete();
    }
}
