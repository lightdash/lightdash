import { getErrorMessage } from '@lightdash/common';
import { promisify } from 'util';
import zlib from 'zlib';
import Logger from '../../../logging/logger';
import type { ResultsPageFormatInputs } from './buildResultsPageRows';
import type {
    ResultsPageBuild,
    ResultsPageWorkerPool,
} from './ResultsPageWorkerPool';
import { getStoredResultsPageKey } from './storedResultsPageKey';

const brotliDecompress = promisify(zlib.brotliDecompress);

const rowCountMetadataKey = 'row-count';
const rawBytesMetadataKey = 'raw-bytes';
const openBracket = 0x5b;
const closeBracket = 0x5d;

export type StoredResultsPageObject = {
    body: Buffer;
    metadata: Record<string, string>;
};

export type StoredResultsPagesStorage = {
    getObjectBytesIfExists(
        key: string,
    ): Promise<StoredResultsPageObject | undefined>;
    putObjectBytes(
        key: string,
        body: Buffer,
        metadata: Record<string, string>,
    ): Promise<void>;
};

export type StoredResultsPageRows = {
    rows: Buffer;
    rowCount: number;
    source: 'stored' | 'built';
};

export type GetStoredResultsPageRowsArgs = {
    storage: StoredResultsPagesStorage;
    resultsFileName: string;
    page: number;
    pageSize: number;
    format: ResultsPageFormatInputs;
    readPageLines: () => Promise<string[]>;
};

export class StoredResultsPages {
    private readonly inFlight = new Map<
        string,
        Promise<StoredResultsPageRows>
    >();

    constructor(
        private readonly options: {
            pool: ResultsPageWorkerPool;
            appVersion: string;
        },
    ) {}

    getRows(
        args: GetStoredResultsPageRowsArgs,
    ): Promise<StoredResultsPageRows> {
        const key = getStoredResultsPageKey({
            resultsFileName: args.resultsFileName,
            appVersion: this.options.appVersion,
            format: args.format,
            pageSize: args.pageSize,
            page: args.page,
        });
        const existing = this.inFlight.get(key);
        if (existing) return existing;

        let upload: Promise<void> = Promise.resolve();
        const rows = (async (): Promise<StoredResultsPageRows> => {
            const stored = await this.readStored(args.storage, key);
            if (stored) return { ...stored, source: 'stored' };
            const built = await this.options.pool.withWorker(async (worker) =>
                worker.build(await args.readPageLines(), args.format),
            );
            upload = this.upload(args.storage, key, built);
            return {
                rows: built.rows,
                rowCount: built.rowCount,
                source: 'built',
            };
        })();
        this.inFlight.set(key, rows);
        void rows
            .then(
                () => upload,
                () => undefined,
            )
            .finally(() => {
                if (this.inFlight.get(key) === rows) this.inFlight.delete(key);
            });
        return rows;
    }

    private async readStored(
        storage: StoredResultsPagesStorage,
        key: string,
    ): Promise<Omit<StoredResultsPageRows, 'source'> | undefined> {
        let object: StoredResultsPageObject | undefined;
        try {
            object = await storage.getObjectBytesIfExists(key);
        } catch (error) {
            Logger.warn(
                `Could not read stored results page ${key}, building it instead: ${getErrorMessage(
                    error,
                )}`,
            );
            return undefined;
        }
        if (!object) return undefined;

        const rowCount = Number(object.metadata[rowCountMetadataKey]);
        const rawBytes = Number(object.metadata[rawBytesMetadataKey]);
        if (
            !Number.isSafeInteger(rowCount) ||
            rowCount < 0 ||
            !Number.isSafeInteger(rawBytes) ||
            rawBytes < 2
        ) {
            Logger.warn(
                `Stored results page ${key} has no valid metadata, building it instead`,
            );
            return undefined;
        }

        let rows: Buffer;
        try {
            rows = await brotliDecompress(object.body, {
                chunkSize: Math.max(zlib.constants.Z_MIN_CHUNK, rawBytes),
                maxOutputLength: rawBytes,
            });
        } catch (error) {
            Logger.warn(
                `Stored results page ${key} did not decompress, building it instead: ${getErrorMessage(
                    error,
                )}`,
            );
            return undefined;
        }
        if (
            rows.length !== rawBytes ||
            rows[0] !== openBracket ||
            rows[rows.length - 1] !== closeBracket
        ) {
            Logger.warn(
                `Stored results page ${key} is not a complete rows array, building it instead`,
            );
            return undefined;
        }
        return { rows, rowCount };
    }

    private async upload(
        storage: StoredResultsPagesStorage,
        key: string,
        built: ResultsPageBuild,
    ): Promise<void> {
        try {
            await storage.putObjectBytes(key, built.compressed, {
                [rowCountMetadataKey]: String(built.rowCount),
                [rawBytesMetadataKey]: String(built.rows.length),
            });
            Logger.info(
                `Stored results page ${key}: ${built.rowCount} rows, ${built.rows.length} bytes, ${built.compressed.length} bytes stored`,
            );
        } catch (error) {
            Logger.warn(
                `Could not store results page ${key}: ${getErrorMessage(error)}`,
            );
        }
    }
}
