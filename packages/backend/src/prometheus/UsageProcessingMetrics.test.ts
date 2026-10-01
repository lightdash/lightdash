import prometheus from 'prom-client';
import { UsageProcessingMetrics } from './UsageProcessingMetrics';

const metricValues = async (registry: prometheus.Registry, suffix: string) =>
    (
        await registry
            .getSingleMetric(`lightdash_usage_processing_${suffix}`)!
            .get()
    ).values;

describe('usage processing metric export', () => {
    afterEach(() => vi.restoreAllMocks());

    it('exports durations, running state and outcomes without fabricating initial freshness', async () => {
        const registry = new prometheus.Registry();
        const metrics = new UsageProcessingMetrics([registry]);
        metrics.setEnabled(false);
        expect(await metricValues(registry, 'enabled')).toMatchObject([
            { value: 0 },
        ]);
        expect(
            await metricValues(registry, 'last_finished_timestamp_seconds'),
        ).toEqual([]);
        metrics.setEnabled(true);
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
        metrics.start('pipeline');
        expect(await metricValues(registry, 'running')).toMatchObject([
            { labels: { stage: 'pipeline' }, value: 1 },
        ]);
        now.mockReturnValue(1_800_000_005_000);
        metrics.finish('pipeline', { outcome: 'success' }, 5);
        expect(await metricValues(registry, 'running')).toMatchObject([
            { value: 0 },
        ]);
        expect(
            await metricValues(registry, 'last_finished_timestamp_seconds'),
        ).toEqual([
            {
                labels: { stage: 'pipeline', outcome: 'success' },
                value: 1_800_000_005,
            },
        ]);
        expect(await registry.metrics()).toContain(
            'lightdash_usage_processing_duration_seconds_sum{stage="pipeline",outcome="success"} 5',
        );
    });

    it('retains prior success separately from later failure and exports lower-bound backlog', async () => {
        const registry = new prometheus.Registry();
        const metrics = new UsageProcessingMetrics([registry]);
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
        metrics.start('users');
        metrics.finish(
            'users',
            {
                outcome: 'success',
                failed: 0,
                remaining: 0,
                limitReached: false,
            },
            1,
        );
        now.mockReturnValue(1_800_100_000_000);
        metrics.start('users');
        expect(await metricValues(registry, 'work')).toEqual([]);
        metrics.finish(
            'users',
            { outcome: 'failed', failed: 2, remaining: 3, limitReached: true },
            10,
        );
        expect(
            await metricValues(registry, 'last_finished_timestamp_seconds'),
        ).toEqual([
            {
                labels: { stage: 'users', outcome: 'success' },
                value: 1_800_000_000,
            },
            {
                labels: { stage: 'users', outcome: 'failed' },
                value: 1_800_100_000,
            },
        ]);
        expect(await metricValues(registry, 'work')).toEqual([
            { labels: { stage: 'users', state: 'failed' }, value: 2 },
            { labels: { stage: 'users', state: 'remaining' }, value: 3 },
            { labels: { stage: 'users', state: 'limit_reached' }, value: 1 },
        ]);
    });

    it('starts a replacement or idle replica without publishing a false completion', async () => {
        const oldRegistry = new prometheus.Registry();
        const oldWorker = new UsageProcessingMetrics([oldRegistry]);
        oldWorker.finish('pipeline', { outcome: 'success' }, 1);
        const newRegistry = new prometheus.Registry();
        const newWorker = new UsageProcessingMetrics([newRegistry]);
        newWorker.setEnabled(true);
        expect(
            await metricValues(oldRegistry, 'last_finished_timestamp_seconds'),
        ).toHaveLength(1);
        expect(
            await metricValues(newRegistry, 'last_finished_timestamp_seconds'),
        ).toEqual([]);
        expect(
            await metricValues(newRegistry, 'last_started_timestamp_seconds'),
        ).toEqual([]);
    });

    it('contains Prometheus failures on enable, start and finish', () => {
        const registry = new prometheus.Registry();
        const metrics = new UsageProcessingMetrics([registry]);
        vi.spyOn(prometheus.Gauge.prototype, 'set').mockImplementation(() => {
            throw new Error('broken registry');
        });
        expect(() => metrics.setEnabled(true)).not.toThrow();
        expect(() => metrics.start('pipeline')).not.toThrow();
        expect(() =>
            metrics.finish('pipeline', { outcome: 'failed' }, 1),
        ).not.toThrow();
    });
});
