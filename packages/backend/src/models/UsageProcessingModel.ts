import {
    type AnalyticsProcessingStats,
    type AnalyticsProcessingStatus,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { z } from 'zod';
import { UsageProcessingStatusTableName } from '../database/entities/usageProcessingStatus';
import Logger from '../logging/logger';

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const terminalStatus = z.enum(['success', 'partial', 'failed']);
const statsSchema = z
    .object({
        partitionsDiscovered: count,
        partitionsCompacted: count,
        partitionsFailed: count,
        rawObjectsDeleted: count,
        dimensionsFailed: count,
        userPartitionsFailed: count,
        userPartitionsDeferred: count,
        limitReached: z.boolean(),
    })
    .strict()
    .refine(
        (stats) =>
            stats.partitionsCompacted + stats.partitionsFailed <=
            stats.partitionsDiscovered,
    );

const successful = (stats: AnalyticsProcessingStats): boolean =>
    stats.partitionsCompacted === stats.partitionsDiscovered &&
    stats.partitionsFailed === 0 &&
    stats.dimensionsFailed === 0 &&
    stats.userPartitionsFailed === 0 &&
    stats.userPartitionsDeferred === 0 &&
    !stats.limitReached;

const rowSchema = z
    .object({
        organization_uuid: z.string().uuid(),
        run_uuid: z.string().uuid(),
        started_at: z.date(),
        finished_at: z.date().nullable(),
        status: z.enum(['running', 'success', 'partial', 'failed']),
        last_successful_at: z.date().nullable(),
        stats: statsSchema,
    })
    .strict()
    .refine((row) =>
        row.status === 'running'
            ? row.finished_at === null
            : row.finished_at !== null && row.finished_at >= row.started_at,
    )
    .refine(
        (row) =>
            row.status !== 'success' ||
            (successful(row.stats) &&
                row.last_successful_at?.getTime() ===
                    row.finished_at?.getTime()),
    );

const emptyStats = (): AnalyticsProcessingStats => ({
    partitionsDiscovered: 0,
    partitionsCompacted: 0,
    partitionsFailed: 0,
    rawObjectsDeleted: 0,
    dimensionsFailed: 0,
    userPartitionsFailed: 0,
    userPartitionsDeferred: 0,
    limitReached: false,
});

export class UsageProcessingModel {
    constructor(private readonly database: Knex) {}

    async start(
        organizationUuids: string[],
        runUuid: string,
        startedAt: Date,
    ): Promise<void> {
        if (organizationUuids.length === 0) return;
        if (!z.date().safeParse(startedAt).success)
            throw new Error('Invalid usage processing start time');
        await this.database(UsageProcessingStatusTableName)
            .insert(
                organizationUuids.map((organizationUuid) => ({
                    organization_uuid: organizationUuid,
                    run_uuid: runUuid,
                    started_at: startedAt,
                    finished_at: null,
                    status: 'running' as const,
                    last_successful_at: null,
                    stats: emptyStats(),
                })),
            )
            .onConflict('organization_uuid')
            .merge(['run_uuid', 'started_at', 'finished_at', 'status', 'stats'])
            .where(
                `${UsageProcessingStatusTableName}.started_at`,
                '<=',
                startedAt,
            );
    }

    async finish({
        organizationUuid,
        runUuid,
        status,
        finishedAt,
        stats,
    }: {
        organizationUuid: string;
        runUuid: string;
        status: Exclude<AnalyticsProcessingStatus['status'], 'running'>;
        finishedAt: Date;
        stats: AnalyticsProcessingStats;
    }): Promise<void> {
        const parsedStatus = terminalStatus.safeParse(status);
        if (!parsedStatus.success || !z.date().safeParse(finishedAt).success)
            throw new Error('Invalid usage processing result');
        const parsed = statsSchema.safeParse(stats);
        if (
            !parsed.success ||
            (status === 'success' && !successful(parsed.data))
        )
            throw new Error('Invalid usage processing statistics');
        await this.database(UsageProcessingStatusTableName)
            .where({ organization_uuid: organizationUuid, run_uuid: runUuid })
            .where('started_at', '<=', finishedAt)
            .update({
                status: parsedStatus.data,
                finished_at: finishedAt,
                stats: parsed.data,
                ...(status === 'success'
                    ? { last_successful_at: finishedAt }
                    : {}),
            });
    }

    async find(
        organizationUuid: string,
    ): Promise<AnalyticsProcessingStatus | null> {
        const row = await this.database(UsageProcessingStatusTableName)
            .where('organization_uuid', organizationUuid)
            .first();
        if (!row) return null;
        const parsed = rowSchema.safeParse(row);
        if (!parsed.success) {
            Logger.warn('Stored usage processing status is invalid');
            return null;
        }
        return {
            status: parsed.data.status,
            startedAt: parsed.data.started_at.toISOString(),
            finishedAt: parsed.data.finished_at?.toISOString() ?? null,
            lastSuccessfulAt:
                parsed.data.last_successful_at?.toISOString() ?? null,
            stats: parsed.data.stats,
        };
    }
}
