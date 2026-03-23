import { getErrorMessage, type ResultColumns } from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    type DuckdbS3SessionConfig,
} from '@lightdash/warehouses';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getJsonlSqlTable } from '../../ee/services/PreAggregateMaterializationService/getDuckdbPreAggregateSqlTable';
import type Logger from '../../logging/logger';
import { writeWithBackpressure } from '../../utils/streamUtils';

type LocalParquetUploadStreamArgs = {
    parquetS3Uri: string;
    s3Config: DuckdbS3SessionConfig;
    logger: typeof Logger;
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
    const PROGRESS_LOG_INTERVAL_MS = 30_000;

    const setColumns = (cols: ResultColumns) => {
        columns = cols;
    };

    const write = async (rows: Record<string, unknown>[]): Promise<void> => {
        if (firstWriteTime === null) firstWriteTime = Date.now();
        writeCalls += 1;

        for (const row of rows) {
            const data = `${JSON.stringify(row)}\n`;
            totalBytesWritten += data.length;
            totalRowsWritten += 1;
            // eslint-disable-next-line no-await-in-loop
            await writeWithBackpressure(fileWriteStream, data);
        }

        const now = Date.now();
        if (now - lastProgressLog >= PROGRESS_LOG_INTERVAL_MS) {
            lastProgressLog = now;
            const elapsedSec = Math.round((now - firstWriteTime!) / 1000);
            const bytesWrittenMB = Math.round(totalBytesWritten / 1024 / 1024);
            logger.info(
                `Streaming progress: rows=${totalRowsWritten} bytes=${bytesWrittenMB}MB elapsed=${elapsedSec}s target=${parquetS3Uri}`,
            );
        }
    };

    const close = async (): Promise<{
        parquetConversionMs?: number;
    }> => {
        if (closed) return {};
        closed = true;

        await new Promise<void>((resolve, reject) => {
            fileWriteStream.end(() => resolve());
            fileWriteStream.on('error', reject);
        });

        if (totalRowsWritten === 0) {
            cleanupDir(tmpDir);
            return {};
        }

        try {
            const duckdb = new DuckdbWarehouseClient({
                s3Config,
                resourceLimits: { memoryLimit: '256MB', threads: 1 },
                logger,
            });

            const localJsonlSqlTable = getJsonlSqlTable(
                localJsonlPath,
                columns,
            );
            const copySql = `COPY (SELECT * FROM ${localJsonlSqlTable}) TO '${parquetS3Uri}' (FORMAT PARQUET, COMPRESSION zstd, ROW_GROUP_SIZE 100000)`;

            const conversionStart = Date.now();
            const metrics = await duckdb.runSqlWithMetrics(copySql);
            const parquetConversionMs = Date.now() - conversionStart;
            const localFileSize = fs.statSync(localJsonlPath).size;

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
    };

    const getStreamMetrics = () => ({
        totalBytesWritten,
        totalRowsWritten,
        writeCalls,
        elapsedMs: firstWriteTime ? Date.now() - firstWriteTime : 0,
    });

    return { write, close, setColumns, getStreamMetrics };
};
