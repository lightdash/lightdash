const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [stateFile, epoch, command, ...args] = process.argv.slice(2);
const record = (state, errors = 0) => {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const temporary = `${stateFile}.${process.pid}`;
    fs.writeFileSync(
        temporary,
        JSON.stringify({ epoch, state, errors, at: Date.now() }),
    );
    fs.renameSync(temporary, stateFile);
};
record('building');
const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'inherit'] });
let buffer = '';
child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    buffer += chunk.toString();
    const lines = buffer.split(/[\r\n]/);
    buffer = lines.pop();
    for (const line of lines) {
        if (/Starting (?:incremental )?compilation/.test(line))
            record('building');
        const finished = line.match(
            /Found (\d+) errors?\. Watching for file changes\./,
        );
        if (finished) record('settled', Number(finished[1]));
    }
});
child.on('error', (error) => {
    record('failed');
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
});
child.on('exit', (code, signal) => {
    record('failed');
    process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => child.kill(signal));
