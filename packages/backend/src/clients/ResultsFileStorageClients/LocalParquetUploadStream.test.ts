import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { writeWithBackpressure } from '../../utils/streamUtils';
import { createLocalParquetUploadStream } from './LocalParquetUploadStream';

jest.mock('@lightdash/warehouses', () => ({
    DuckdbWarehouseClient: jest.fn(),
}));

jest.mock('../../utils/streamUtils', () => ({
    writeWithBackpressure: jest.fn(() => Promise.resolve()),
}));

describe('LocalParquetUploadStream', () => {
    const duckdbWarehouseClientMock =
        DuckdbWarehouseClient as unknown as jest.Mock;
    const logger = {
        info: jest.fn(),
        error: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        duckdbWarehouseClientMock.mockImplementation(() => ({
            runSqlWithMetrics: jest.fn().mockResolvedValue({ totalMs: 123 }),
        }));
    });

    it('writes each row batch as a single backpressure call', async () => {
        const stream = createLocalParquetUploadStream({
            parquetS3Uri: 's3://bucket/results.parquet',
            s3Config: {} as never,
            logger: logger as never,
        });

        await stream.write([{ a: 1 }, { a: 2 }]);
        await stream.close();

        expect(writeWithBackpressure).toHaveBeenCalledTimes(1);
        expect(writeWithBackpressure).toHaveBeenCalledWith(
            expect.anything(),
            '{"a":1}\n{"a":2}\n',
        );
    });

    it('times out parquet conversion if close takes too long', async () => {
        duckdbWarehouseClientMock.mockImplementation(() => ({
            runSqlWithMetrics: jest.fn(() => new Promise(() => {})),
        }));

        const stream = createLocalParquetUploadStream({
            parquetS3Uri: 's3://bucket/results.parquet',
            s3Config: {} as never,
            logger: logger as never,
            closeTimeoutMs: 100,
        });

        await stream.write([{ a: 1 }]);
        await expect(stream.close()).rejects.toThrow(
            'Parquet conversion timed out after 100ms',
        );
    }, 1000);
});
