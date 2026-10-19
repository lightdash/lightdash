const http = require('http');
const https = require('https');
const { Command, program } = require('commander');
const { createRequire } = require('module');

// The entry under test is src/index.ts or dist/index.js; share its globalState instance.
const requireCli = createRequire(process.argv[1]);
program.hook('preAction', () =>
    requireCli('./globalState').default.setVerbose(true),
);
const originalRequest = https.request;
https.request = function routeAnalytics(options, callback) {
    if (options.hostname === 'analytics.lightdash.com') {
        const sink = new URL(process.env.LIGHTDASH_URL);
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
const originalAction = Command.prototype.action;
Command.prototype.action = function instrumentCompile(handler) {
    if (this.name() !== 'compile') return originalAction.call(this, handler);
    return originalAction.call(
        this,
        function compileWithServerManifest(options, ...rest) {
            return handler.call(
                this,
                {
                    ...options,
                    combineManifestProjectUuid: process.env.CLI_TEST_PROJECT,
                },
                ...rest,
            );
        },
    );
};
