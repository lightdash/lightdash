const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const [stateFile, epoch] = process.argv.slice(2);
const requireBackend = createRequire(path.join(process.cwd(), 'package.json'));
const requireWatcher = createRequire(requireBackend.resolve('chokidar-cli'));
const chokidar = requireWatcher('chokidar');
const record = (state) => {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const temporary = `${stateFile}.${process.pid}`;
    fs.writeFileSync(
        temporary,
        JSON.stringify({ epoch, state, errors: 0, at: Date.now() }),
    );
    fs.renameSync(temporary, stateFile);
};
record('building');
let child = null;
let timer = null;
let pending = false;
const run = () => {
    if (child) {
        pending = true;
        return;
    }
    record('building');
    child = spawn('pnpm', ['run', 'generate-api:build'], { stdio: 'inherit' });
    child.on('error', () => record('failed'));
    child.on('exit', (code) => {
        child = null;
        if (pending) {
            pending = false;
            run();
        } else record(code === 0 ? 'settled' : 'failed');
    });
};
const watcher = chokidar.watch('./src/**/controllers/**/*.ts', {
    ignoreInitial: true,
});
watcher.on('ready', () => record('settled'));
watcher.on('error', () => record('failed'));
watcher.on('all', () => {
    record('building');
    clearTimeout(timer);
    timer = setTimeout(run, 300);
});
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, async () => {
        clearTimeout(timer);
        await watcher.close();
        if (child) child.kill(signal);
        else process.exit(0);
    });
