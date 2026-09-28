const path = require('node:path');
const { createRequire } = require('node:module');

const root = process.env.LDENV_WORKTREE;
if (!root) throw new Error('LDENV_WORKTREE is required');
const config = require(path.join(root, 'ecosystem.config.js'));
const api = config.apps.find((app) => app.name.endsWith('-api'));
const scheduler = config.apps.find((app) => app.name.endsWith('-scheduler'));
if (!api || !scheduler)
    throw new Error('API or scheduler configuration is missing');
api.node_args = api.node_args.replace(
    '--inspect=0.0.0.0:',
    '--inspect=127.0.0.1:',
);
api.env.SCHEDULER_ENABLED = 'true';
api.ignore_watch = [
    ...api.ignore_watch,
    '**/*.md',
    '**/*.mdx',
    '**/*.map',
    '**/*.test.ts',
    '**/*.test.tsx',
];
for (const app of config.apps) {
    app.env = {
        ...app.env,
        OTEL_SDK_DISABLED:
            (process.env.LDENV_TRACING ?? app.env?.LDENV_TRACING) === 'true'
                ? 'false'
                : 'true',
    };
}
if (process.env.LDENV_WATCH_STATE_DIR && process.env.LDENV_START_EPOCH) {
    for (const name of ['common', 'formula', 'warehouses']) {
        const compiler = config.apps.find((app) =>
            app.name.endsWith(`-${name}-watch`),
        );
        if (!compiler) throw new Error(`Missing ${name} watcher`);
        const command = path.resolve(compiler.cwd, compiler.script);
        const args = Array.isArray(compiler.args)
            ? compiler.args
            : compiler.args.split(/\s+/);
        const nativeWatch = process.platform === 'darwin';
        compiler.script = path.join(__dirname, 'compiler-watch.cjs');
        compiler.interpreter = process.execPath;
        compiler.args = [
            path.join(process.env.LDENV_WATCH_STATE_DIR, `${name}.json`),
            process.env.LDENV_START_EPOCH,
            nativeWatch ? process.execPath : command,
            ...(nativeWatch
                ? [
                      path.join(__dirname, 'compiler-trigger.cjs'),
                      name,
                      root,
                      command,
                      ...args.filter(
                          (arg) =>
                              arg !== '--watch' &&
                              arg !== '--preserveWatchOutput',
                      ),
                  ]
                : args),
        ];
    }
}
scheduler.watch = api.watch;
scheduler.ignore_watch = api.ignore_watch;
scheduler.watch_options = api.watch_options;
scheduler.watch_delay = api.watch_delay;
const mode = process.env.LDENV_BACKEND ?? api.env.LDENV_BACKEND ?? 'bundle';
if (!['tsx', 'bundle'].includes(mode))
    throw new Error('Backend mode must be tsx or bundle');
if (mode === 'bundle') {
    const toolRequire = createRequire(
        path.join(__dirname, '../../package.json'),
    );
    api.script = path.join(__dirname, 'bundle-runner.ts');
    api.args = [];
    api.node_args = ['--import', toolRequire.resolve('tsx')];
    api.watch = false;
    api.kill_timeout = 10000;
    api.env = {
        ...api.env,
        LDENV_BACKEND: mode,
        LDENV_WORKTREE: root,
        LDENV_HOME: process.env.LDENV_HOME,
    };
}
const backend = require(path.join(root, 'packages/backend/package.json'));
const command = backend.scripts['generate-api-dev'];
const separator = command.indexOf(' && ');
if (separator < 0)
    throw new Error('Cannot identify the API route watch command');
const watcher = config.apps.find((app) =>
    app.name.endsWith('-api-routes-watch'),
);
if (!watcher)
    throw new Error('API route watcher is missing from the ecosystem');
watcher.script = 'pnpm';
watcher.args = ['exec', 'bash', '-c', command.slice(separator + 4)];
watcher.cwd = path.join(root, 'packages/backend');
if (process.env.LDENV_WATCH_STATE_DIR && process.env.LDENV_START_EPOCH) {
    watcher.script = path.join(__dirname, 'routes-watch.cjs');
    watcher.interpreter = process.execPath;
    watcher.args = [
        path.join(process.env.LDENV_WATCH_STATE_DIR, 'routes.json'),
        process.env.LDENV_START_EPOCH,
    ];
}
const frontend = config.apps.find((app) => app.name.endsWith('-frontend'));
if (frontend) {
    frontend.script = path.join(__dirname, 'vite-launcher.cjs');
    frontend.interpreter = process.execPath;
    frontend.args = ['serve', root];
    frontend.cwd = path.join(root, 'packages/frontend');
}
module.exports = config;
