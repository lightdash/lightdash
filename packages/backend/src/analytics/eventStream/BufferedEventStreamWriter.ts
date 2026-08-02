import { getErrorMessage } from '@lightdash/common';
import { randomUUID } from 'crypto';
import { promisify } from 'util';
import { gzip } from 'zlib';
import { S3BaseClient } from '../../clients/Aws/S3BaseClient';
import { S3Config } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { EventStreamRow, EventStreamWriter } from './types';

const gzipAsync = promisify(gzip);

const S3_KEY_PREFIX = 'events/raw';
const PUT_RETRIES = 2;

type BufferedEvent = {
    stream: string;
    row: EventStreamRow;
};

type EventGroup = {
    orgId: string;
    stream: string;
    dt: string;
    rows: EventStreamRow[];
};

export type BufferedEventStreamWriterArgs = {
    s3Config: Omit<S3Config, 'expirationTime'>;
    flushIntervalMs: number;
    flushBatchSize: number;
    bufferMaxSize: number;
    prometheusMetrics: PrometheusMetrics;
};

const getUtcDate = (eventTs: string): string => {
    const parsed = new Date(eventTs);
    const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return date.toISOString().slice(0, 10);
};

/**
 * Per-process buffered writer for the usage-analytics raw event zone.
 * Buffers rows in memory and periodically flushes them to S3 as gzip JSONL
 * objects partitioned by (org_id, stream, dt). Never throws into the caller.
 */
export class BufferedEventStreamWriter
    extends S3BaseClient
    implements EventStreamWriter
{
    private readonly bucket: string;

    private readonly flushBatchSize: number;

    private readonly bufferMaxSize: number;

    private readonly prometheusMetrics: PrometheusMetrics;

    private readonly writerId: string;

    private readonly flushTimer: NodeJS.Timeout;

    private buffer: BufferedEvent[] = [];

    private flushInFlight: Promise<void> | null = null;

    private closed = false;

    constructor(args: BufferedEventStreamWriterArgs) {
        super(args.s3Config);
        this.bucket = args.s3Config.bucket;
        this.flushBatchSize = args.flushBatchSize;
        this.bufferMaxSize = args.bufferMaxSize;
        this.prometheusMetrics = args.prometheusMetrics;
        this.writerId = randomUUID().slice(0, 8);
        this.flushTimer = setInterval(() => {
            void this.flush();
        }, args.flushIntervalMs);
        // Don't keep the process alive for the flush timer
        this.flushTimer.unref();
    }

    push(streamName: string, row: EventStreamRow): void {
        try {
            if (this.closed || this.buffer.length >= this.bufferMaxSize) {
                this.prometheusMetrics.incrementUsageEventsDropped();
                return;
            }
            this.buffer.push({ stream: streamName, row });
            this.prometheusMetrics.incrementUsageEventsPushed();
            if (this.buffer.length >= this.flushBatchSize) {
                void this.flush();
            }
        } catch (error) {
            Logger.warn(
                `Failed to push usage event: ${getErrorMessage(error)}`,
            );
        }
    }

    flush(): Promise<void> {
        if (!this.flushInFlight) {
            this.flushInFlight = this.runFlush()
                .catch((error) => {
                    Logger.warn(
                        `Failed to flush usage events: ${getErrorMessage(
                            error,
                        )}`,
                    );
                })
                .finally(() => {
                    this.flushInFlight = null;
                });
        }
        return this.flushInFlight;
    }

    async close(): Promise<void> {
        this.closed = true;
        clearInterval(this.flushTimer);
        if (this.flushInFlight) {
            await this.flushInFlight;
        }
        await this.flush();
    }

    private async runFlush(): Promise<void> {
        if (this.buffer.length === 0) {
            return;
        }
        const events = this.buffer;
        this.buffer = [];

        const groups = new Map<string, EventGroup>();
        events.forEach(({ stream, row }) => {
            const dt = getUtcDate(row.event_ts);
            const groupKey = `${row.org_id}|${stream}|${dt}`;
            const group = groups.get(groupKey);
            if (group) {
                group.rows.push(row);
            } else {
                groups.set(groupKey, {
                    orgId: row.org_id,
                    stream,
                    dt,
                    rows: [row],
                });
            }
        });

        await Promise.all(
            Array.from(groups.values(), (group) => this.putGroup(group)),
        );
    }

    private async putGroup(group: EventGroup): Promise<void> {
        const key = `${S3_KEY_PREFIX}/org_id=${group.orgId}/stream=${
            group.stream
        }/dt=${group.dt}/${this.writerId}-${randomUUID()}.jsonl.gz`;
        try {
            const jsonl = `${group.rows
                .map((row) => JSON.stringify(row))
                .join('\n')}\n`;
            const body = await gzipAsync(jsonl);

            for (let attempt = 0; attempt <= PUT_RETRIES; attempt += 1) {
                try {
                    if (!this.s3) {
                        throw new Error('S3 client is not configured');
                    }
                    // eslint-disable-next-line no-await-in-loop
                    await this.s3.putObject({
                        Bucket: this.bucket,
                        Key: key,
                        Body: body,
                        ContentType: 'application/gzip',
                    });
                    this.prometheusMetrics.incrementUsageEventsFlushed(
                        group.rows.length,
                    );
                    this.prometheusMetrics.incrementUsageEventsRawPuts();
                    return;
                } catch (error) {
                    if (attempt === PUT_RETRIES) {
                        throw error;
                    }
                }
            }
        } catch (error) {
            this.prometheusMetrics.incrementUsageEventsPutFailure();
            Logger.warn(
                `Dropping ${
                    group.rows.length
                } usage events after failed PUT to s3://${
                    this.bucket
                }/${key}: ${getErrorMessage(error)}`,
            );
        }
    }
}
