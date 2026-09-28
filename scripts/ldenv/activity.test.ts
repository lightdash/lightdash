import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import {
    activityFromSnapshot,
    eligibleActivityProcesses,
    openFileReferences,
    parseLsofPaths,
    readyActivity,
    readyReferences,
    referencesFromSnapshot,
    type ActivityProcess,
} from './activity';
import type { Instance } from './model';

const spare = '/worktrees/ready-one';
const instance = { id: 'spare-one', worktree: spare } as Instance;

test('an ldenv directory or script mentioned in arguments does not hide an agent', () => {
    const rows = [
        {
            pid: 10,
            ppid: 1,
            command: 'python3 validate.py /reports/ldenv mac-1',
        },
        { pid: 11, ppid: 10, command: '/bin/sleep 300' },
        {
            pid: 12,
            ppid: 1,
            command: 'node agent.js /repo/scripts/ldenv/index.ts',
        },
        {
            pid: 13,
            ppid: 1,
            command:
                'node --import tsx /repo/scripts/ldenv/index.ts pool monitor',
        },
    ];
    assert.deepEqual(
        eligibleActivityProcesses(rows, [], 999).map((row) => row.pid),
        [10, 11, 12],
    );
    assert.equal(
        activityFromSnapshot(
            [instance],
            rows,
            new Map([[11, spare]]),
            [],
            999,
        ).get(instance.id)?.pid,
        11,
    );
});

test('activity picks an agent cwd and excludes PM2, observer, ldenv and probes', () => {
    const rows: ActivityProcess[] = [
        { pid: 1, ppid: 0, command: 'launchd' },
        {
            pid: 10,
            ppid: 1,
            command: 'PM2 v6.0.14: God Daemon (/home/me/.pm2)',
        },
        { pid: 11, ppid: 10, command: 'node api' },
        { pid: 12, ppid: 11, command: 'node watcher' },
        {
            pid: 20,
            ppid: 1,
            command: 'node scripts/ldenv/index.ts pool-monitor',
        },
        { pid: 21, ppid: 20, command: 'git status' },
        { pid: 22, ppid: 21, command: 'git child' },
        { pid: 30, ppid: 1, command: 'codex app-server' },
        { pid: 31, ppid: 30, command: 'codex worker' },
        { pid: 40, ppid: 1, command: 'lsof -d cwd' },
        { pid: 50, ppid: 1, command: 'ps -axo pid,ppid' },
        { pid: 60, ppid: 1, command: 'zsh' },
        { pid: 61, ppid: 60, command: 'node observer' },
        { pid: 62, ppid: 61, command: 'node child' },
    ];
    const cwds = new Map(rows.map((row) => [row.pid, spare]));
    const eligible = eligibleActivityProcesses(rows, [11], 61);
    assert.deepEqual(
        eligible.map((row) => row.pid),
        [30, 31],
    );
    assert.deepEqual(
        [...activityFromSnapshot([instance], rows, cwds, [11], 61)],
        [['spare-one', { pid: 30, command: 'codex app-server' }]],
    );
});

test('activity uses path boundaries and maps each process to the deepest spare', () => {
    const nested = {
        id: 'nested',
        worktree: path.join(spare, 'nested'),
    } as Instance;
    const rows: ActivityProcess[] = [
        { pid: 100, ppid: 1, command: 'codex app-server' },
        { pid: 101, ppid: 1, command: 'claude' },
        { pid: 102, ppid: 1, command: 'editor' },
    ];
    const cwds = new Map([
        [100, `${spare}-other`],
        [101, path.join(spare, 'nested', 'src')],
        [102, path.join(spare, 'src')],
    ]);
    assert.deepEqual(
        [...activityFromSnapshot([instance, nested], rows, cwds, [], 999)],
        [
            ['nested', { pid: 101, command: 'claude' }],
            ['spare-one', { pid: 102, command: 'editor' }],
        ],
    );
});

test('readyActivity reads cwd only for eligible processes', async () => {
    const rows: ActivityProcess[] = [
        { pid: 9, ppid: 1, command: 'PM2 v6.0.14: God Daemon (/home/me/.pm2)' },
        { pid: 10, ppid: 9, command: 'node api' },
        { pid: 11, ppid: 10, command: 'node api child' },
        { pid: 20, ppid: 1, command: 'codex app-server' },
        { pid: 30, ppid: 1, command: 'node scripts/ldenv/index.ts' },
    ];
    let scanned: number[] = [];
    const matches = await readyActivity([instance], {
        processes: async () => rows,
        pm2Roots: async () => [10],
        cwds: async (pids) => {
            scanned = pids;
            return new Map([[20, spare]]);
        },
        observerPid: 999,
    });
    assert.deepEqual(scanned, [20]);
    assert.deepEqual(matches.get(instance.id), {
        pid: 20,
        command: 'codex app-server',
    });
});

test('activity excludes transient shell probes and unrelated cwd', () => {
    const rows: ActivityProcess[] = [
        { pid: 1, ppid: 0, command: 'init' },
        { pid: 10, ppid: 1, command: '/bin/sh -c git status' },
        { pid: 11, ppid: 10, command: 'git status' },
        { pid: 20, ppid: 1, command: 'codex app-server' },
    ];
    const cwds = new Map([
        [10, spare],
        [11, spare],
        [20, '/worktrees/another'],
    ]);
    assert.equal(activityFromSnapshot([instance], rows, cwds, [], 999).size, 0);
});

test('references find an external editor with cwd elsewhere and exclude internal trees', () => {
    const rows: ActivityProcess[] = [
        { pid: 1, ppid: 0, command: 'launchd' },
        {
            pid: 10,
            ppid: 1,
            command: 'PM2 v6.0.14: God Daemon (/home/me/.pm2)',
        },
        { pid: 11, ppid: 10, command: 'node api' },
        { pid: 12, ppid: 11, command: 'node watcher' },
        { pid: 20, ppid: 1, command: 'node scripts/ldenv/index.ts' },
        { pid: 30, ppid: 1, command: 'node observer' },
        { pid: 31, ppid: 30, command: 'lsof -p 40' },
        { pid: 40, ppid: 1, command: 'editor' },
    ];
    const references = new Map([
        [11, [path.join(spare, 'api.log')]],
        [12, [path.join(spare, 'watcher.log')]],
        [20, [path.join(spare, 'state.json')]],
        [30, [path.join(spare, 'note.txt')]],
        [40, ['/elsewhere', path.join(spare, 'src', 'app.ts')]],
    ]);
    assert.equal(
        activityFromSnapshot(
            [instance],
            rows,
            new Map([[40, '/elsewhere']]),
            [11],
            30,
        ).size,
        0,
    );
    assert.deepEqual(
        [...referencesFromSnapshot([instance], rows, references, [11], 30)],
        [['spare-one', { pid: 40, command: 'editor' }]],
    );
});

test('references respect spare boundaries and choose the deepest worktree', () => {
    const nested = {
        id: 'nested',
        worktree: path.join(spare, 'nested'),
    } as Instance;
    const rows: ActivityProcess[] = [
        { pid: 100, ppid: 1, command: 'editor' },
        { pid: 101, ppid: 1, command: 'editor' },
        { pid: 102, ppid: 1, command: 'editor' },
    ];
    const references = new Map([
        [100, [`${spare}-other/file.ts`]],
        [101, [path.join(spare, 'nested', 'file.ts')]],
        [102, [path.join(spare, 'file.ts')]],
    ]);
    assert.deepEqual(
        [
            ...referencesFromSnapshot(
                [instance, nested],
                rows,
                references,
                [],
                999,
            ),
        ],
        [
            ['nested', { pid: 101, command: 'editor' }],
            ['spare-one', { pid: 102, command: 'editor' }],
        ],
    );
});

test('lsof parser reads cwd and open file paths without treating sockets as paths', () => {
    const output = [
        'p40',
        'fcwd',
        'n/elsewhere',
        'f3r',
        `n${path.join(spare, 'src', 'app.ts')}`,
        'f4u',
        'nTCP 127.0.0.1:8080',
        'p41',
        'fcwd',
        `n${spare}`,
    ].join('\n');
    assert.deepEqual(
        [...parseLsofPaths(output)],
        [
            [40, ['/elsewhere', path.join(spare, 'src', 'app.ts')]],
            [41, [spare]],
        ],
    );
    assert.deepEqual(
        [...parseLsofPaths(output, true)],
        [
            [40, ['/elsewhere']],
            [41, [spare]],
        ],
    );
});

test('readyReferences scans eligible PIDs and propagates probe failures', async () => {
    const rows: ActivityProcess[] = [
        { pid: 10, ppid: 1, command: 'node api' },
        { pid: 20, ppid: 1, command: 'editor' },
        { pid: 30, ppid: 1, command: 'node scripts/ldenv/index.ts' },
    ];
    let scanned: number[] = [];
    const operations = {
        processes: async () => rows,
        pm2Roots: async () => [10],
        references: async (pids: number[]) => {
            scanned = pids;
            return new Map([[20, [path.join(spare, 'file.ts')]]]);
        },
        observerPid: 999,
    };
    assert.deepEqual(
        [...(await readyReferences([instance], operations))],
        [['spare-one', { pid: 20, command: 'editor' }]],
    );
    assert.deepEqual(scanned, [20]);
    await assert.rejects(
        readyReferences([instance], {
            ...operations,
            references: async () => {
                throw new Error('lsof timed out');
            },
        }),
        /lsof timed out/,
    );
});

test('open file probe accepts valid partial lsof records on exit one', async () => {
    const output = `p40\nfcwd\nn/elsewhere\nf3r\nn${path.join(spare, 'src', 'app.ts')}\n`;
    let invoked: string[] = [];
    const references = await openFileReferences([40, 41], async (args) => {
        invoked = args;
        throw Object.assign(new Error('lsof exited 1'), {
            code: 1,
            stdout: output,
            stderr: '',
            killed: false,
            signal: null,
        });
    });
    assert.deepEqual(invoked, ['-nP', '-p', '40,41', '-Fpfn']);
    assert.deepEqual(
        [...references],
        [[40, ['/elsewhere', path.join(spare, 'src', 'app.ts')]]],
    );
    assert.deepEqual(
        [
            ...(await openFileReferences([41], async () => {
                throw Object.assign(new Error('lsof exited 1'), {
                    code: 1,
                    stdout: '',
                    stderr: '',
                    killed: false,
                    signal: null,
                });
            })),
        ],
        [],
    );
});

test('open file probe rejects killed, diagnostic and malformed lsof results', async () => {
    const output = `p40\nfcwd\nn${spare}\n`;
    const failure = (changes: Record<string, unknown>) =>
        Object.assign(
            new Error('lsof exited 1'),
            {
                code: 1,
                stdout: output,
                stderr: '',
                killed: false,
                signal: null,
            },
            changes,
        );
    await assert.rejects(
        openFileReferences([40], async () => {
            throw failure({ killed: true, signal: 'SIGTERM' });
        }),
        /lsof exited 1/,
    );
    await assert.rejects(
        openFileReferences([40], async () => {
            throw failure({ code: null, killed: true, signal: 'SIGTERM' });
        }),
        /lsof exited 1/,
    );
    await assert.rejects(
        openFileReferences([40], async () => {
            throw failure({ stderr: 'lsof: permission denied' });
        }),
        /lsof exited 1/,
    );
    await assert.rejects(
        openFileReferences([40], async () => {
            throw failure({ stdout: `p40\nn${spare}\n` });
        }),
        /malformed lsof/i,
    );
    await assert.rejects(
        openFileReferences([40], async () => {
            throw failure({ stdout: 'p40\n' });
        }),
        /malformed lsof/i,
    );
    await assert.rejects(
        openFileReferences([40], async () => ({
            stdout: 'garbled output\n',
            stderr: '',
        })),
        /malformed lsof/i,
    );
    await assert.rejects(
        openFileReferences([40], async () => ({
            stdout: output,
            stderr: 'lsof: warning',
        })),
        /lsof.*diagnostic/i,
    );
});
