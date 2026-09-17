import { Upload } from '@aws-sdk/lib-storage';
import { getErrorMessage } from '@lightdash/common';
import type { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { createReadStream, createWriteStream } from 'fs';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { S3BaseClient } from '../../clients/Aws/S3BaseClient';
import type { S3Config } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import type { UsageDimensionsModel } from '../../models/UsageDimensionsModel';
import { quoteDuckdbIdentifier } from '../../utils/duckdb/duckdbSqlTables';
import {
    usageDimensionKey,
    usageDimensionNames,
    usageDimensionSchemas,
    type UsageDimensionName,
} from './usageDimensions';

export type DimensionRefreshSummary = {
    refreshed: number;
    failed: number;
};

const literal = (value: string): string => `'${value.replace(/'/g, "''")}'`;

export class UsageDimensionsRefresher extends S3BaseClient {
    constructor(
        private readonly storage: Omit<S3Config, 'expirationTime'>,
        private readonly model: Pick<
            UsageDimensionsModel,
            'getOrganizations' | 'getJsonLines'
        >,
        private readonly duckdb: Pick<
            DuckdbWarehouseClient,
            'runSqlWithMetrics'
        >,
    ) {
        super(storage);
    }

    async run(): Promise<DimensionRefreshSummary> {
        const summary = { refreshed: 0, failed: 0 };
        try {
            // eslint-disable-next-line no-restricted-syntax
            for await (const organization of this.model.getOrganizations()) {
                for (const dimension of usageDimensionNames) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await this.refresh(
                            organization.organization_uuid,
                            dimension,
                            this.model.getJsonLines(organization, dimension),
                        );
                        summary.refreshed += 1;
                    } catch (error) {
                        summary.failed += 1;
                        Logger.error(
                            `Usage dimensions refresh failed for org_id=${organization.organization_uuid}/dim=${dimension}: ${getErrorMessage(error)}`,
                        );
                    }
                }
            }
            Logger.info(
                `Usage dimensions refresh: ${summary.refreshed} published, ${summary.failed} failed`,
            );
            return summary;
        } finally {
            this.s3?.destroy();
        }
    }

    private async refresh(
        orgId: string,
        dimension: UsageDimensionName,
        rows: AsyncIterable<string>,
    ): Promise<void> {
        if (!this.s3)
            throw new Error('Usage dimensions storage is not configured');
        const directory = await mkdtemp(
            path.join(tmpdir(), 'usage-dimensions-'),
        );
        const jsonFile = path.join(directory, 'snapshot.jsonl');
        const parquetFile = path.join(directory, 'snapshot.parquet');
        const columns = usageDimensionSchemas[dimension];
        try {
            await pipeline(
                Readable.from(rows, { objectMode: false }),
                createWriteStream(jsonFile, { mode: 0o600 }),
            );
            const { size } = await stat(jsonFile);
            const select =
                size === 0
                    ? `SELECT ${columns.map(({ name, type }) => `NULL::${type} AS ${quoteDuckdbIdentifier(name)}`).join(', ')} WHERE false`
                    : `SELECT ${columns.map(({ name }) => quoteDuckdbIdentifier(name)).join(', ')} FROM read_json(${literal(jsonFile)}, format='newline_delimited', columns={${columns.map(({ name, type }) => `${quoteDuckdbIdentifier(name)}: '${type}'`).join(', ')}})`;
            await this.duckdb.runSqlWithMetrics(
                `COPY (${select}) TO ${literal(parquetFile)} (FORMAT PARQUET, COMPRESSION zstd, ROW_GROUP_SIZE 16384)`,
            );
            const body = createReadStream(parquetFile);
            try {
                await new Upload({
                    client: this.s3,
                    queueSize: 1,
                    partSize: 8 * 1024 * 1024,
                    leavePartsOnError: false,
                    params: {
                        Bucket: this.storage.bucket,
                        Key: usageDimensionKey(orgId, dimension),
                        Body: body,
                        ContentType: 'application/vnd.apache.parquet',
                    },
                }).done();
            } finally {
                body.destroy();
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
}
