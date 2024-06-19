import express from 'express';
import http from 'http';
import prometheus from 'prom-client';
import { LightdashConfig } from './config/parseConfig';

export default function initPrometheusMetrics({
    enabled,
    port,
    path,
    ...rest
}: LightdashConfig['prometheus']) {
    if (enabled) {
        prometheus.collectDefaultMetrics({
            ...rest,
        });
        const app = express();
        const server = http.createServer(app);
        app.get(path, async (req, res) => {
            res.set('Content-Type', prometheus.register.contentType);
            res.end(await prometheus.register.metrics());
        });
        server.listen(port);
    }
}
