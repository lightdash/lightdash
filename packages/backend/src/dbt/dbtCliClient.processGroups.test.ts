import { SupportedDbtVersions } from '@lightdash/common';
import execa from 'execa';
import { EventEmitter } from 'node:events';

vi.mock('execa');

it.skipIf(process.platform !== 'linux')(
    'tracks only live detached process groups and kills them on process exit',
    async () => {
        vi.resetModules();
        const once = vi.spyOn(process, 'once');
        const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
        const { DbtCliClient } = await import('./dbtCliClient');
        expect(
            once.mock.calls.filter(([event]) => event === 'exit'),
        ).toHaveLength(0);
        const events = new EventEmitter();
        let finish!: () => void;
        const subprocess = Object.assign(
            new Promise((resolve) => {
                finish = () => resolve({ all: '', stdout: '' });
            }),
            {
                pid: 100001,
                once: events.once.bind(events),
                kill: vi.fn(),
            },
        );
        vi.mocked(execa).mockReturnValue(subprocess as never);
        const client = new DbtCliClient({
            dbtProjectDirectory: '/tmp',
            dbtProfilesDirectory: '/tmp',
            environment: {},
            environmentVariableAllowlist: [],
            explicitCredentials: false,
            dbtVersion: SupportedDbtVersions.V1_12,
            partialParseBaselinePath: null,
        });
        try {
            vi.mocked(execa).mockReturnValueOnce(
                Object.assign(Promise.resolve({ all: '', stdout: '' }), {
                    kill: vi.fn(),
                    once: vi.fn(),
                }) as never,
            );
            await client.installDeps();
            expect(
                once.mock.calls.filter(([event]) => event === 'exit'),
            ).toHaveLength(0);
            const work = client.installDeps(new AbortController().signal);
            await vi.waitFor(() =>
                expect(events.listenerCount('exit')).toBe(1),
            );
            const exitHandlers = once.mock.calls.filter(
                ([event]) => event === 'exit',
            );
            expect(exitHandlers).toHaveLength(1);
            const onExit = exitHandlers[0][1];
            onExit(0);
            expect(kill).toHaveBeenCalledExactlyOnceWith(-100001, 'SIGKILL');
            kill.mockClear();
            events.emit('exit', 0);
            expect(kill).toHaveBeenCalledExactlyOnceWith(-100001, 'SIGKILL');
            kill.mockClear();
            onExit(0);
            expect(kill).not.toHaveBeenCalled();
            finish();
            await work;

            events.removeAllListeners();
            await client.installDeps();
            expect(events.listenerCount('exit')).toBe(0);
            expect(
                vi.mocked(execa).mock.calls.at(-1)?.at(2),
            ).not.toHaveProperty('detached');
            onExit(0);
            expect(kill).not.toHaveBeenCalled();

            const detached = client.installDeps(new AbortController().signal);
            await detached;
            kill.mockImplementation(() => {
                throw Object.assign(new Error('leaf_a exited'), {
                    code: 'ESRCH',
                });
            });
            expect(() => onExit(0)).not.toThrow();
            events.emit('exit', 0);
        } finally {
            finish();
            for (const [event, handler] of once.mock.calls) {
                if (event === 'exit') process.removeListener('exit', handler);
            }
            await client.cleanup();
            vi.restoreAllMocks();
        }
    },
);
