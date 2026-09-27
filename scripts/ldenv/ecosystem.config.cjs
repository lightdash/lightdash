const path = require('node:path');

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
scheduler.watch = api.watch;
scheduler.ignore_watch = api.ignore_watch;
scheduler.watch_options = api.watch_options;
scheduler.watch_delay = api.watch_delay;
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
module.exports = config;
