import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import {
    createExternalSourceExplore,
    DimensionType,
    ExploreType,
    EXTERNAL_SOURCE_ROW_COUNT_METRIC,
    ExternalSourceScope,
    ExternalSourceType,
    MetricType,
    SupportedDbtAdapter,
    type ResultColumns,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { duckdbTypeToDimensionType } from '../../../utils/duckdb/duckdbTypeToDimensionType';
import {
    ExternalSourceService,
    getAttachmentTableName,
    shouldPublishExternalSourceExplore,
} from './ExternalSourceService';

/**
 * Pins the ingest SQL contract on a real in-memory DuckDB: schema discovery
 * via DESCRIBE-in-a-subquery with normalized column names, CSV to parquet
 * conversion, and row counting — the exact statements the ingest job runs.
 */
describe('external source ingest SQL contract', () => {
    let tmpDir: string;
    let csvPath: string;
    let parquetPath: string;
    let connection: DuckDBConnection;

    const describeSql = (uri: string, fn: 'read_csv' | 'read_parquet') =>
        fn === 'read_csv'
            ? `SELECT column_name, column_type FROM (DESCRIBE SELECT * FROM read_csv('${uri}', normalize_names=true))`
            : `SELECT column_name, column_type FROM (DESCRIBE SELECT * FROM read_parquet('${uri}'))`;

    beforeAll(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-source-test-'));
        csvPath = path.join(tmpDir, 'upload.csv');
        parquetPath = path.join(tmpDir, 'out.parquet');
        fs.writeFileSync(
            csvPath,
            [
                'Account Name,Target ($),Signed Date,Active',
                'Acme Corp,420000,2026-01-02,true',
                'Northstar Labs,275000,2026-02-10,false',
                'Orbit Systems,310000,2026-03-15,true',
            ].join('\n'),
        );
        const instance = await DuckDBInstance.create(':memory:');
        connection = await instance.connect();
    });

    afterAll(() => {
        connection.closeSync();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const readRows = async (sql: string) => {
        const reader = await connection.runAndReadAll(sql);
        return reader.getRowObjects();
    };

    it('discovers a normalized, typed schema from a CSV', async () => {
        const rows = await readRows(describeSql(csvPath, 'read_csv'));
        const byName = Object.fromEntries(
            rows.map((row) => [
                String(row.column_name),
                String(row.column_type),
            ]),
        );
        expect(Object.keys(byName)).toHaveLength(4);
        Object.keys(byName).forEach((name) => {
            expect(name).toMatch(/^[a-z_][a-z0-9_]*$/);
        });
        expect(byName.account_name).toBe('VARCHAR');
        expect(duckdbTypeToDimensionType(byName.signed_date)).toBe(
            DimensionType.DATE,
        );
        expect(duckdbTypeToDimensionType(byName.active)).toBe(
            DimensionType.BOOLEAN,
        );
        const targetColumn = Object.entries(byName).find(([name]) =>
            name.includes('target'),
        );
        expect(targetColumn).toBeDefined();
        expect(duckdbTypeToDimensionType(targetColumn![1])).toBe(
            DimensionType.NUMBER,
        );
    });

    it('converts the CSV to parquet and counts rows', async () => {
        await connection.run(
            `COPY (SELECT * FROM read_csv('${csvPath}', normalize_names=true, sample_size=-1)) TO '${parquetPath}' (FORMAT PARQUET, COMPRESSION zstd, ROW_GROUP_SIZE 100000)`,
        );
        const describeRows = await readRows(
            describeSql(parquetPath, 'read_parquet'),
        );
        expect(describeRows).toHaveLength(4);
        const countRows = await readRows(
            `SELECT COUNT(*) AS row_count FROM read_parquet('${parquetPath}')`,
        );
        expect(Number(countRows[0].row_count)).toBe(3);
    });

    it('builds an explore with auto-metrics from the inferred schema', async () => {
        const describeRows = await readRows(describeSql(csvPath, 'read_csv'));
        const columns = describeRows.reduce<ResultColumns>((acc, row) => {
            const reference = String(row.column_name);
            acc[reference] = {
                reference,
                type: duckdbTypeToDimensionType(String(row.column_type)),
            };
            return acc;
        }, {});

        const explore = createExternalSourceExplore({
            name: 'quarterly_targets',
            label: 'Quarterly targets',
            columns,
            externalSource: {
                sourceUuid: 'source-uuid',
                tableUuid: 'table-uuid',
                sourceType: ExternalSourceType.CSV,
            },
            warehouseSqlBuilder: warehouseSqlBuilderFromType(
                SupportedDbtAdapter.DUCKDB,
            ),
        });

        expect(explore.type).toBe(ExploreType.EXTERNAL_SOURCE);
        expect(explore.externalSource).toEqual({
            sourceUuid: 'source-uuid',
            tableUuid: 'table-uuid',
            sourceType: ExternalSourceType.CSV,
        });
        const table = explore.tables.quarterly_targets;
        expect(table.sqlTable).toBe('"quarterly_targets"');

        expect(table.dimensions.account_name).toBeDefined();
        // Date columns get the default time-interval dimensions
        expect(table.dimensions.signed_date_month).toBeDefined();
        expect(table.dimensions.signed_date_year).toBeDefined();

        const rowCountMetric = table.metrics[EXTERNAL_SOURCE_ROW_COUNT_METRIC];
        expect(rowCountMetric.type).toBe(MetricType.COUNT);

        const numericReference = Object.values(columns).find(
            (column) => column.type === DimensionType.NUMBER,
        )!.reference;
        expect(table.metrics[`${numericReference}_sum`].type).toBe(
            MetricType.SUM,
        );
        expect(table.metrics[`${numericReference}_avg`].type).toBe(
            MetricType.AVERAGE,
        );
        // Boolean/string columns get no sum/avg
        expect(table.metrics.active_sum).toBeUndefined();
        expect(table.metrics.account_name_sum).toBeUndefined();
    });
});

describe('external source catalog publishing', () => {
    it('publishes catalog sources but keeps AI attachments out of explores', () => {
        expect(
            shouldPublishExternalSourceExplore(ExternalSourceScope.CATALOG),
        ).toBe(true);
        expect(
            shouldPublishExternalSourceExplore(ExternalSourceScope.ATTACHMENT),
        ).toBe(false);
    });

    it('gives attachments a private SQL name unrelated to the filename', () => {
        expect(
            getAttachmentTableName('2b5624c2-249c-474b-9681-820460a9bf08'),
        ).toBe('attachment_2b5624c2_249c_474b_9681_820460a9bf08');
    });
});

describe('external source ingest capacity', () => {
    it('defers an attachment when organization capacity is full', async () => {
        const schedulerClient = {
            ingestExternalSource: vi.fn(),
            ingestExternalSourceAttachment: vi.fn().mockResolvedValue({
                jobId: 'job-uuid',
            }),
        };
        const externalSourceModel = {
            claimIngestAttempt: vi.fn().mockResolvedValue({
                state: 'capacity',
                attachment: true,
            }),
        };
        const service = new ExternalSourceService({
            lightdashConfig: lightdashConfigMock,
            externalSourceModel,
            schedulerClient,
        } as never);

        const payload = { attemptUuid: 'attempt-uuid' } as never;
        await expect(service.runIngest(payload)).resolves.toBeUndefined();
        expect(
            schedulerClient.ingestExternalSourceAttachment,
        ).toHaveBeenCalledWith(
            payload,
            expect.objectContaining({ runAt: expect.any(Date) }),
        );
        expect(schedulerClient.ingestExternalSource).not.toHaveBeenCalled();
    });

    it('finishes a duplicate job whose attempt is already running', async () => {
        const externalSourceModel = {
            claimIngestAttempt: vi
                .fn()
                .mockResolvedValue({ state: 'unavailable' }),
        };
        const service = new ExternalSourceService({
            lightdashConfig: lightdashConfigMock,
            externalSourceModel,
        } as never);

        await expect(
            service.runIngest({ attemptUuid: 'attempt-uuid' } as never),
        ).resolves.toBeUndefined();
    });
});
