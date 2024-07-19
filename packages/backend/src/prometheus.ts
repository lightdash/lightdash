import express from 'express';
import http from 'http';
import { performance } from 'perf_hooks';
import prometheus from 'prom-client';
import { LightdashConfig } from './config/parseConfig';
import Logger from './logging/logger';
import { SchedulerClient } from './scheduler/SchedulerClient';

export default class PrometheusMetrics {
    private readonly config: LightdashConfig['prometheus'];

    private server: http.Server | null = null;

    constructor(config: LightdashConfig['prometheus']) {
        this.config = config;
    }

    public start() {
        const { enabled, port, path, labels, ...rest } = this.config;

        if (enabled) {
            try {
                if (labels) {
                    prometheus.register.setDefaultLabels(labels);
                }

                prometheus.collectDefaultMetrics({
                    ...rest,
                });

                const eventLoopUtilization = new prometheus.Gauge({
                    name: 'nodejs_eventloop_utilization',
                    help: 'The utilization value(%) is the calculated Event Loop Utilization (ELU).',
                    ...rest,
                    collect() {
                        // Invoked when the registry collects its metrics' values.
                        this.set(
                            performance.eventLoopUtilization().utilization,
                        );
                    },
                });
                const app = express();
                this.server = http.createServer(app);
                app.get(path, async (req, res) => {
                    res.set('Content-Type', prometheus.register.contentType);
                    res.end(await prometheus.register.metrics());
                });
                this.server.listen(port, () => {
                    Logger.info(
                        `Prometheus metrics available at localhost:${port}${path}`,
                    );
                });
            } catch (e) {
                Logger.error('Error starting prometheus metrics', e);
            }
        }
    }

    public monitorQueues(schedulerClient: SchedulerClient) {
        const { enabled, ...rest } = this.config;
        if (enabled) {
            const queueSizeGauge = new prometheus.Gauge({
                name: 'queue_size',
                help: 'Number of jobs in the queue',
                ...rest,
                async collect() {
                    const queueSize = await schedulerClient.getQueueSize();
                    this.set(queueSize);
                },
            });
        }
    }

    public stop() {
        if (this.server) {
            this.server.close();
        }
    }
}
