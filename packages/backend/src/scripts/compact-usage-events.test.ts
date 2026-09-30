import { LightdashConfig } from '../config/parseConfig';
import { enqueueUsageEventsCompaction } from './compact-usage-events';

const database = vi.hoisted(() => ({
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
}));
vi.mock('pg', () => ({
    // A constructable mock is required because production calls new Client().
    // eslint-disable-next-line prefer-arrow-callback
    Client: vi.fn(function Client() {
        return database;
    }),
}));

describe('on-demand usage compaction', () => {
    const config = {
        usageEvents: { enabled: true, s3: { bucket: 'test-bucket' } },
        database: {},
    } as LightdashConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        database.query.mockResolvedValue({ rows: [{ id: '42' }] });
    });

    it.each([
        { enabled: false, s3: { bucket: 'test-bucket' } },
        { enabled: true, s3: null },
    ])(
        'refuses disabled or unconfigured capture before connecting',
        async (usageEvents) => {
            await expect(
                enqueueUsageEventsCompaction({
                    ...config,
                    usageEvents,
                } as LightdashConfig),
            ).rejects.toThrow('Usage events must be enabled');
            expect(database.connect).not.toHaveBeenCalled();
        },
    );

    it('uses the nightly queue and deduplicates pending manual requests', async () => {
        await expect(enqueueUsageEventsCompaction(config)).resolves.toBe('42');
        expect(database.query).toHaveBeenCalledWith(
            expect.stringContaining("queue_name := 'usage-events-compaction'"),
            ['compactUsageEvents'],
        );
        expect(database.query.mock.calls[0][0]).toContain(
            "job_key := 'manual-usage-events-compaction'",
        );
        expect(database.end).toHaveBeenCalledOnce();
    });

    it('propagates enqueue failures and closes the connection', async () => {
        database.query.mockRejectedValueOnce(new Error('database unavailable'));
        await expect(enqueueUsageEventsCompaction(config)).rejects.toThrow(
            'database unavailable',
        );
        expect(database.end).toHaveBeenCalledOnce();
    });
});
