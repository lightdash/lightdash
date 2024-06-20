import express from 'express';
import http from 'http';
import { performance } from 'perf_hooks';
import prometheus from 'prom-client';
import { LightdashConfig } from './config/parseConfig';
import Logger from './logging/logger';

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
                const eventLoopUtilization = new prometheus.Gauge({
                    name: 'nodejs_eventloop_utilization',
                    help: 'The utilization value(%) is the calculated Event Loop Utilization (ELU).',
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

    public stop() {
        if (this.server) {
            this.server.close();
        }
    }
}
