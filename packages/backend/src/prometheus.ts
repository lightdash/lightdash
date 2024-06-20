import express from 'express';
import http from 'http';
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
        const { enabled, port, path, ...rest } = this.config;
        if (enabled) {
            try {
                prometheus.collectDefaultMetrics({
                    ...rest,
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
        const { queueMonitoringFrequency, enabled, ...rest } = this.config;
        if (enabled) {
            const queueSizeGauge = new prometheus.Gauge({
                name: 'queue_size',
                help: 'Number of jobs in the queue',
                ...rest,
                collect() {},
            });
            setInterval(async () => {
                const queueSize = await schedulerClient.getQueueSize();
                queueSizeGauge.set(queueSize);
            }, queueMonitoringFrequency || 30 * 1000); // 30 seconds
        }
    }

    public stop() {
        if (this.server) {
            this.server.close();
        }
    }
}
