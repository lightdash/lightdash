import { getErrorMessage, type ResultColumns } from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    type DuckdbS3SessionConfig,
} from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getJsonlSqlTable } from '../../ee/services/PreAggregateMaterializationService/getDuckdbPreAggregateSqlTable';
import type Logger from '../../logging/logger';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { writeWithBackpressure } from '../../utils/streamUtils';

type LocalParquetUploadStreamArgs = {
    parquetS3Uri: string;
    s3Config: DuckdbS3SessionConfig;
    logger: typeof Logger;
    prometheusMetrics?: PrometheusMetrics;
};

const cleanupDir = (dir: string) => {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch {
        // best-effort cleanup
    }
};

/**
 * Streams rows as JSONL to a local temp file, then on close() converts
 * to Parquet and uploads directly to S3 via DuckDB.
 *
 * This avoids the S3 round-trip of: upload JSONL to S3 → DuckDB reads
 * from S3 → DuckDB writes Parquet to S3.
 *
 * Rows should arrive pre-sorted by dimensions from the warehouse query
 * for optimal Parquet compression.
 */
export const createLocalParquetUploadStream = ({
    parquetS3Uri,
    s3Config,
    logger,
    prometheusMetrics,
}: LocalParquetUploadStreamArgs) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lightdash-parquet-'));
    const localJsonlPath = path.join(tmpDir, 'data.jsonl');
    const fileWriteStream = fs.createWriteStream(localJsonlPath, {
        highWaterMark: 16 * 1024 * 1024,
    });

    let totalBytesWritten = 0;
    let totalRowsWritten = 0;
    let writeCalls = 0;
    let firstWriteTime: number | null = null;
    let closed = false;
    let columns: ResultColumns | null = null;
    let lastProgressLog = 0;
    let totalWriteMs = 0;
    const PROGRESS_LOG_INTERVAL_MS = 30_000;

    const setColumns = (cols: ResultColumns) => {
        columns = cols;
    };

    const write = async (rows: Record<string, unknown>[]): Promise<void> => {
        if (firstWriteTime === null) firstWriteTime = Date.now();
        writeCalls += 1;

        const writeStart = Date.now();

        const chunk = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
        totalBytesWritten += Buffer.byteLength(chunk, 'utf8');
        totalRowsWritten += rows.length;
        await writeWithBackpressure(fileWriteStream, chunk);

        totalWriteMs += Date.now() - writeStart;

        const now = Date.now();
        if (now - lastProgressLog >= PROGRESS_LOG_INTERVAL_MS) {
            lastProgressLog = now;
            const elapsedSec = Math.round((now - firstWriteTime!) / 1000);
            const bytesWrittenMB = Math.round(totalBytesWritten / 1024 / 1024);
            const avgWriteMs =
                writeCalls > 0 ? Math.round(totalWriteMs / writeCalls) : 0;
            logger.info(
                `Streaming progress: rows=${totalRowsWritten} bytes=${bytesWrittenMB}MB elapsed=${elapsedSec}s avgWriteMs=${avgWriteMs} target=${parquetS3Uri}`,
            );
        }
    };

    const close = async (): Promise<{
        parquetConversionMs?: number;
    }> => {
        if (closed) return {};
        closed = true;

        return Sentry.startSpan(
            {
                op: 'parquet.stream.close',
                name: 'LocalParquetUploadStream.close',
                attributes: {
                    'parquet.target': parquetS3Uri,
                    'parquet.total_rows': totalRowsWritten,
                    'parquet.total_bytes': totalBytesWritten,
                    'parquet.write_calls': writeCalls,
                    'parquet.total_write_ms': totalWriteMs,
                },
            },
            async (closeSpan) => {
                await Sentry.startSpan(
                    {
                        op: 'file.flush',
                        name: 'LocalParquetUploadStream.flushJsonl',
                    },
                    () =>
                        new Promise<void>((resolve, reject) => {
                            fileWriteStream.on('error', reject);
                            fileWriteStream.end(() => resolve());
                        }),
                );

                const totalElapsedMs = firstWriteTime
                    ? Date.now() - firstWriteTime
                    : 0;
                logger.info(
                    `Stream closed: rows=${totalRowsWritten} bytes=${Math.round(totalBytesWritten / 1024 / 1024)}MB writeCalls=${writeCalls} totalWriteMs=${totalWriteMs} totalElapsedMs=${totalElapsedMs} target=${parquetS3Uri}`,
                );

                if (totalRowsWritten === 0) {
                    cleanupDir(tmpDir);
                    return {};
                }

                try {
                    const duckdb = Sentry.startSpan(
                        {
                            op: 'parquet.duckdb.init',
                            name: 'LocalParquetUploadStream.duckdbInit',
                        },
                        () =>
                            new DuckdbWarehouseClient(
                                { type: 'duckdb_s3', s3Config },
                                {
                                    resourceLimits: {
                                        memoryLimit: '256MB',
                                        threads: 1,
                                    },
                                    logger,
                                    onQueryProfile:
                                        prometheusMetrics?.observeDuckdbQueryProfile,
                                },
                            ),
                    );

                    const localJsonlSqlTable = getJsonlSqlTable(
                        localJsonlPath,
                        columns,
                    );
                    const copySql = `COPY (SELECT * FROM ${localJsonlSqlTable}) TO '${parquetS3Uri}' (FORMAT PARQUET, COMPRESSION zstd, ROW_GROUP_SIZE 100000)`;

                    const conversionStart = Date.now();
                    const metrics = await Sentry.startSpan(
                        {
                            op: 'parquet.duckdb.convert',
                            name: 'LocalParquetUploadStream.parquetConvert',
                            attributes: {
                                'parquet.rows': totalRowsWritten,
                                'parquet.jsonl_bytes': totalBytesWritten,
                            },
                        },
                        () => duckdb.runSqlWithMetrics(copySql),
                    );
                    const parquetConversionMs = Date.now() - conversionStart;
                    const localFileSize = fs.statSync(localJsonlPath).size;

                    closeSpan.setAttribute(
                        'parquet.conversion_ms',
                        parquetConversionMs,
                    );
                    closeSpan.setAttribute(
                        'parquet.jsonl_file_bytes',
                        localFileSize,
                    );
                    closeSpan.setAttribute(
                        'parquet.duckdb_ms',
                        metrics.totalMs,
                    );

                    logger.info(
                        `Parquet conversion complete: rows=${totalRowsWritten} jsonlBytes=${localFileSize} duckdbMs=${metrics.totalMs} target=${parquetS3Uri}`,
                    );

                    return { parquetConversionMs };
                } catch (error) {
                    logger.error(
                        `Failed to convert local JSONL to Parquet: ${getErrorMessage(error)}`,
                    );
                    throw error;
                } finally {
                    cleanupDir(tmpDir);
                }
            },
        );
    };

    const getStreamMetrics = () => ({
        totalBytesWritten,
        totalRowsWritten,
        writeCalls,
        totalWriteMs,
        elapsedMs: firstWriteTime ? Date.now() - firstWriteTime : 0,
    });

    return { write, close, setColumns, getStreamMetrics };
};
