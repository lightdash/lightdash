import { DimensionType } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import Logger from '../../logging/logger';
import {
    createLocalParquetUploadStream,
    PreAggregateResultsTooLargeError,
} from './LocalParquetUploadStream';

vi.mock('@lightdash/warehouses', () => ({
    DuckdbWarehouseClient: vi.fn(),
}));

const mockConversionFailure = (error: Error) => {
    vi.mocked(DuckdbWarehouseClient).mockImplementation(
        class {
            runSqlWithMetrics = vi.fn().mockRejectedValue(error);
        } as unknown as typeof DuckdbWarehouseClient,
    );
};

const createStream = () =>
    createLocalParquetUploadStream({
        parquetS3Uri: 's3://bucket/file.parquet',
        s3Config: {} as Parameters<
            typeof createLocalParquetUploadStream
        >[0]['s3Config'],
        logger: Logger,
    });

const writeWideRows = async (
    stream: ReturnType<typeof createLocalParquetUploadStream>,
) => {
    const fieldIds = ['orders_status', 'orders_city', 'orders_total'];
    await stream.write([
        { orders_status: 'shipped', orders_city: 'Lisbon', orders_total: 1 },
        { orders_status: 'placed', orders_city: 'Porto', orders_total: 2 },
    ]);
    stream.setColumns(
        Object.fromEntries(
            fieldIds.map((reference) => [
                reference,
                { reference, type: DimensionType.STRING },
            ]),
        ),
    );
};

describe('createLocalParquetUploadStream', () => {
    afterEach(() => {
        vi.mocked(DuckdbWarehouseClient).mockReset();
    });

    test('reports the result size when DuckDB runs out of memory', async () => {
        mockConversionFailure(
            new Error(
                'Out of Memory Error: failed to pin block of size 256.0 KiB (244.1 MiB/244.1 MiB used)',
            ),
        );
        const stream = createStream();
        await writeWideRows(stream);

        const closing = stream.close();
        await expect(closing).rejects.toBeInstanceOf(
            PreAggregateResultsTooLargeError,
        );
        await expect(closing).rejects.toMatchObject({
            name: 'PreAggregateResultsTooLargeError',
            statusCode: 422,
        });
        await expect(closing).rejects.toThrow(
            "This pre-aggregate's results are too large to store (2 rows and 3 columns, 1 MB).",
        );
    });

    test('rethrows other conversion errors unchanged', async () => {
        const error = new Error('IO Error: connection refused');
        mockConversionFailure(error);
        const stream = createStream();
        await writeWideRows(stream);

        await expect(stream.close()).rejects.toBe(error);
    });
});
