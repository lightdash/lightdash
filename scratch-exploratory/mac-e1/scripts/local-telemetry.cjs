const { Writable, PassThrough } = require('node:stream');
const https = require('node:https');
const originalRequest = https.request;
global.__thunderTelemetryBlocked = 0;
https.request = function (input, options, callback) {
    const host = typeof input === 'string' || input instanceof URL
        ? new URL(input).hostname
        : input.hostname || input.host;
    if (host !== 'analytics.lightdash.com') return originalRequest.apply(this, arguments);
    global.__thunderTelemetryBlocked += 1;
    const request = new Writable({
        write(chunk, encoding, done) { done(); },
        final(done) {
            done();
            queueMicrotask(() => {
                const response = new PassThrough();
                response.statusCode = 204;
                response.statusMessage = 'No Content';
                response.headers = {};
                response.rawHeaders = [];
                response.httpVersion = '1.1';
                request.emit('response', response);
                const handler = typeof options === 'function' ? options : callback;
                if (handler) handler(response);
                response.end();
            });
        },
    });
    request.setTimeout = () => request;
    request.abort = () => request.destroy();
    return request;
};
const originalFetch = global.fetch;
global.fetch = function (input, options) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname !== 'analytics.lightdash.com') return originalFetch.apply(this, arguments);
    global.__thunderTelemetryBlocked += 1;
    return Promise.resolve(new Response(null, { status: 204 }));
};
