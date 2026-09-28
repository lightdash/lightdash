const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [name, root, command, ...args] = process.argv.slice(2);
if (!['common', 'formula', 'warehouses'].includes(name))
    throw new Error(`Unknown compiler package: ${name}`);

const packages = name === 'warehouses' ? ['warehouses', 'common'] : [name];
const watchers = [];
let child = null;
let timer = null;
let pending = false;
let stopping = false;

const build = (initial) => {
    if (stopping) return;
    process.stdout.write(
        initial
            ? 'Starting compilation in watch mode...\n'
            : 'File change detected. Starting incremental compilation...\n',
    );
    child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (error) => {
        process.stderr.write(`${error.message}\n`);
        process.exit(1);
    });
    child.on('exit', (code) => {
        child = null;
        if (stopping) return;
        const errors = code === 0 ? 0 : 1;
        process.stdout.write(
            `Found ${errors} ${errors === 1 ? 'error' : 'errors'}. Watching for file changes.\n`,
        );
        if (pending) schedule();
    });
};

const schedule = () => {
    if (stopping) return;
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        if (child) return;
        pending = false;
        build(false);
    }, 100);
};

const watch = (directory, recursive, accepts) => {
    const watcher = fs.watch(directory, { recursive }, (_event, filename) => {
        if (accepts(filename?.toString())) schedule();
    });
    watcher.on('error', (error) => {
        process.stderr.write(`${error.message}\n`);
        process.exit(1);
    });
    watchers.push(watcher);
};

watch(root, false, (filename) =>
    ['tsconfig.json', 'package.json', 'pnpm-lock.yaml'].includes(filename),
);
for (const packageName of packages) {
    const directory = path.join(root, 'packages', packageName);
    watch(
        path.join(directory, 'src'),
        true,
        (filename) => !filename || /\.(?:[cm]?[jt]sx?|json)$/.test(filename),
    );
    watch(
        directory,
        false,
        (filename) =>
            filename === 'package.json' ||
            (filename?.startsWith('tsconfig') && filename.endsWith('.json')),
    );
}

for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
        stopping = true;
        if (timer) clearTimeout(timer);
        watchers.forEach((watcher) => watcher.close());
        if (!child) process.exit(0);
        child.once('exit', () => process.exit(0));
        child.kill(signal);
    });

build(true);
