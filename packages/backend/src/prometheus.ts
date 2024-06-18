import * as client from 'prom-client';

export const registerDefaultPrometheusMetrics = () => {
    client.collectDefaultMetrics();
};
