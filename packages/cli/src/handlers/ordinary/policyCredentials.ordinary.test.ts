import { AuthTokenPrefix } from '@lightdash/common';
import chalk from 'chalk';
import { Command } from 'commander';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { OrdinaryServer, personalConfig, saveConfig } from './harness.mocks';

const location = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async (original) => ({
    ...(await original<typeof import('os')>()),
    homedir: () => location.home,
}));
vi.mock('../../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
let server: OrdinaryServer;
let file: string;
let before: string;
let config: ReturnType<typeof personalConfig>;
const previousExit = process.exitCode;
beforeEach(async () => {
    vi.resetModules();
    for (const key of [
        'LIGHTDASH_AGENT_CONNECTION',
        'LIGHTDASH_API_KEY',
        'LIGHTDASH_PROJECT',
        'LIGHTDASH_URL',
        'LIGHTDASH_PROXY_AUTHORIZATION',
        'LIGHTDASH_API_TIMEOUT_MS',
    ])
        vi.stubEnv(key, undefined);
    vi.stubEnv('CI', 'true');
    chalk.level = 0;
    location.home = await fs.mkdtemp(path.join(tmpdir(), 'ordinary-deploy-'));
    server = new OrdinaryServer();
    await server.start();
    config = personalConfig(server.url);
    file = await saveConfig(location.home, config);
    before = await fs.readFile(file, 'utf8');
    await fs.writeFile(
        path.join(location.home, 'lightdash.config.yml'),
        'spotlight:\n  default_visibility: show\n',
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Unexpected exit');
    });
    process.exitCode = undefined;
});
afterEach(async () => {
    vi.useRealTimers();
    await server.close();
    await fs.rm(location.home, { recursive: true, force: true });
    process.exitCode = previousExit;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

it('retains action receiver, arguments, options and awaited completion for every ordinary policy entry', async () => {
    const { COMMAND_POLICY, assertAgentCommandAllowed } =
        await import('../../agentConnections/commandPolicy');
    const { registerAgentConnectionOption } =
        await import('../../agentConnectionOption');
    const { getAgentConnectionSelection } = await import('../../credentials');
    const configModule = await import('../../config');
    const get = vi.spyOn(configModule, 'getConfig');
    await [...Object.keys(COMMAND_POLICY), 'future-command'].reduce(
        async (previous, name) => {
            await previous;
            const program = new Command();
            registerAgentConnectionOption(program);
            const command = program.command('entry <value>').option('--flag');
            let completed = false;
            const action = vi.fn(async function ordinaryAction(
                this: Command,
                value: string,
                options: { flag: boolean },
                passed: Command,
            ) {
                expect(this).toBe(command);
                expect(passed).toBe(command);
                expect(value).toBe('input');
                expect(options).toEqual({ flag: true });
                expect(getAgentConnectionSelection()).toBeNull();
                assertAgentCommandAllowed(name, {
                    create: true,
                    source: 'finance',
                    organization: true,
                    includeAll: true,
                });
                await Promise.resolve();
                completed = true;
            });
            command.action(action);
            await expect(
                program.parseAsync(['entry', 'input', '--flag'], {
                    from: 'user',
                }),
            ).resolves.toBe(program);
            expect(completed).toBe(true);
            expect(action).toHaveBeenCalledExactlyOnceWith(
                'input',
                { flag: true },
                command,
            );
        },
        Promise.resolve(),
    );
    expect(get).not.toHaveBeenCalled();
    expect(server.requests).toEqual([]);
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
});
it.each(['personal', 'service', 'missing', 'lifecycle'])(
    'pins ordinary credential resolution: %s',
    async (mode) => {
        config.context!.apiKey = (() => {
            if (mode === 'missing') {
                return undefined;
            }
            if (mode === 'service') {
                return `${AuthTokenPrefix.SERVICE_ACCOUNT}fixture`;
            }
            return 'ldpat_pin';
        })();
        await saveConfig(location.home, config);
        before = await fs.readFile(file, 'utf8');
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { AgentTokenProvider } =
            await import('../../agentConnections/agentTokenProvider');
        const provider = vi.spyOn(AgentTokenProvider.prototype, 'getToken');
        const { AgentConnectionStore } =
            await import('../../agentConnections/store');
        const store = vi.spyOn(AgentConnectionStore.prototype, 'readSlot');
        const { resolveCredential } = await import('../../credentials');
        const execution = resolveCredential(
            await configModule.getConfig(),
            null,
            null,
            mode === 'lifecycle'
                ? { kind: 'status', grantUuid: 'grant', generation: 1 }
                : null,
        );
        if (mode === 'missing')
            await expect(execution).rejects.toThrow(
                "Not logged in. Run 'lightdash login --help'",
            );
        else if (mode === 'lifecycle')
            await expect(execution).rejects.toThrow(
                'An agent connection selection is required.',
            );
        else
            await expect(execution).resolves.toEqual({
                kind: mode === 'service' ? 'service_account' : 'human_api_key',
                token: config.context!.apiKey,
            });
        expect(get.mock.calls).toEqual([[]]);
        expect(provider).not.toHaveBeenCalled();
        expect(store).not.toHaveBeenCalled();
        expect(server.requests).toEqual([]);
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(console.error).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
