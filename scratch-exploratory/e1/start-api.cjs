const path = require('node:path');
const fs = require('node:fs');
const child = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const pm2 = require(path.join(root, 'node_modules/pm2'));
const dotenv = require(path.join(root, 'node_modules/dotenv'));
const status = JSON.parse(child.execFileSync(path.join(require('node:os').homedir(), '.ldenv/bin/ldenv'), ['status', '--json'], {cwd: root, encoding: 'utf8'}));
if (path.resolve(status.worktree) !== root || !status.ports) throw new Error('Start an owned ldenv instance first');
for (const file of ['.env', '.env.development', '.env.development.local']) Object.assign(process.env, dotenv.parse(fs.readFileSync(path.join(root, file))));
if (!process.env.LIGHTDASH_SECRET) throw new Error('Local environment is incomplete');
const env = {...process.env, PATH: [path.join(root,'examples/multi-repo-dbt-sim/.work/bin'),process.env.PATH].filter(Boolean).join(path.delimiter), NODE_OPTIONS: '--max-old-space-size=4096', LIGHTDASH_ENABLE_FEATURE_FLAGS: 'multi-dbt-sources,cross-source-dbt-refs,multi-connection-projects', LIGHTDASH_LOG_CONSOLE_FORMAT: 'json', DBT_SOURCE_FETCH_CONCURRENCY: '2', NODE_PATH: [path.join(root,'packages/backend/node_modules'),path.join(root,'node_modules')].join(path.delimiter), LDENV_WORKTREE: root, NODE_ENV: 'development', LIGHTDASH_MODE: 'development', HEADLESS: 'true', PORT: String(status.ports.api)};
const script = process.argv[2];
if (!script || !fs.existsSync(script)) throw new Error('Provide a built backend bundle');
const name = status.id+'-api';
pm2.connect(error => {
    if (error) throw error;
    pm2.delete(name, () => pm2.start({name, script: path.resolve(script), cwd: path.join(root,'packages/backend'), interpreter: process.execPath, env, watch: false, autorestart: true}, error => {
        pm2.disconnect();
        if (error) throw error;
        console.log('Owned API started without watchers.');
    }));
});
