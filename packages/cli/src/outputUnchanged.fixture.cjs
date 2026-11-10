const http = require('http');
const https = require('https');

const originalRequest = https.request;
https.request = function routeAnalytics(options, callback) {
    if (options.hostname === 'analytics.lightdash.com') {
        const sink = new URL(process.env.CLI_OUTPUT_TEST_SERVER);
        return http.request(
            {
                ...options,
                protocol: 'http:',
                hostname: sink.hostname,
                port: sink.port,
                path: `/analytics${options.path}`,
            },
            callback,
        );
    }
    return originalRequest.call(this, options, callback);
};

const originalHttpRequest = http.request;
http.request = function routeConfig(options, callback) {
    if (options.hostname === '127.0.0.1' && String(options.port) === '3000') {
        const sink = new URL(process.env.CLI_OUTPUT_TEST_SERVER);
        return originalHttpRequest.call(
            this,
            { ...options, port: sink.port },
            callback,
        );
    }
    return originalHttpRequest.call(this, options, callback);
};
