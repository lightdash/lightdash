import prometheus from 'prom-client';
import Logger from '../logging/logger';

export type UsageProcessingStage =
    | 'pipeline'
    | 'compaction'
    | 'dimensions'
    | 'users';
export type UsageProcessingOutcome = 'success' | 'partial' | 'failed';
export type UsageProcessingResult = {
    outcome: UsageProcessingOutcome;
    // Stage-specific units: raw partitions, dimension snapshots or user partitions.
    failed?: number;
    remaining?: number;
    limitReached?: boolean;
};

/** Process-local signals. Freshness queries must include historical pod samples. */
export class UsageProcessingMetrics {
    private readonly enabled: prometheus.Gauge;

    private readonly running: prometheus.Gauge<'stage'>;

    private readonly started: prometheus.Gauge<'stage'>;

    private readonly finished: prometheus.Gauge<'stage' | 'outcome'>;

    private readonly duration: prometheus.Histogram<'stage' | 'outcome'>;

    private readonly work: prometheus.Gauge<'stage' | 'state'>;

    constructor(registers?: prometheus.Registry[]) {
        this.enabled = new prometheus.Gauge({
            name: 'lightdash_usage_processing_enabled',
            help: 'Whether this worker is configured to process usage data',
            registers,
        });
        this.running = new prometheus.Gauge({
            name: 'lightdash_usage_processing_running',
            help: 'Whether a usage processing stage is running in this process',
            labelNames: ['stage'],
            registers,
        });
        this.started = new prometheus.Gauge({
            name: 'lightdash_usage_processing_last_started_timestamp_seconds',
            help: 'Last usage stage start; absent until observed in this process',
            labelNames: ['stage'],
            registers,
        });
        this.finished = new prometheus.Gauge({
            name: 'lightdash_usage_processing_last_finished_timestamp_seconds',
            help: 'Last usage stage finish by outcome; success requires no known remaining work',
            labelNames: ['stage', 'outcome'],
            registers,
        });
        this.duration = new prometheus.Histogram({
            name: 'lightdash_usage_processing_duration_seconds',
            help: 'Usage stage duration, including the complete pipeline',
            labelNames: ['stage', 'outcome'],
            buckets: [1, 5, 15, 60, 300, 900, 1800, 3600, 7200],
            registers,
        });
        this.work = new prometheus.Gauge({
            name: 'lightdash_usage_processing_work',
            help: 'Last returned stage summary: failed or known remaining units, or a limit_reached boolean (not an exact backlog when capped)',
            labelNames: ['stage', 'state'],
            registers,
        });
    }

    private static safely(record: () => void) {
        try {
            record();
        } catch {
            Logger.warn('Failed to record usage processing metrics');
        }
    }

    setEnabled(enabled: boolean) {
        UsageProcessingMetrics.safely(() => this.enabled.set(Number(enabled)));
    }

    start(stage: UsageProcessingStage) {
        UsageProcessingMetrics.safely(() => {
            this.started.set({ stage }, Date.now() / 1000);
            this.running.set({ stage }, 1);
            // Do not let a previous run's work counts describe an in-flight run.
            this.work.remove(stage, 'failed');
            this.work.remove(stage, 'remaining');
            this.work.remove(stage, 'limit_reached');
        });
    }

    finish(
        stage: UsageProcessingStage,
        result: UsageProcessingResult,
        durationSeconds: number,
    ) {
        UsageProcessingMetrics.safely(() => {
            this.running.set({ stage }, 0);
            this.finished.set(
                { stage, outcome: result.outcome },
                Date.now() / 1000,
            );
            this.duration.observe(
                { stage, outcome: result.outcome },
                durationSeconds,
            );
            // A thrown error has no complete summary; do not invent zero counts.
            if (result.failed !== undefined)
                this.work.set({ stage, state: 'failed' }, result.failed);
            if (result.remaining !== undefined)
                this.work.set({ stage, state: 'remaining' }, result.remaining);
            if (result.limitReached !== undefined)
                this.work.set(
                    { stage, state: 'limit_reached' },
                    Number(result.limitReached),
                );
        });
    }
}
