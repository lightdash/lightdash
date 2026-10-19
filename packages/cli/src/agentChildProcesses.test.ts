import { Command } from 'commander';
import { slotFixture } from './agentConnections/fixtures';
import { runWithAgentConnectionSelection } from './credentials';
import { getCompiledModels } from './dbt/models';
import {
    dbtList,
    maybeCompileModelsAndJoins,
    type DbtCompileOptions,
} from './handlers/dbt/compile';
import getDbtProfileTargetName from './handlers/dbt/getDbtProfileTargetName';
import { getDbtVersion } from './handlers/dbt/getDbtVersion';
import getWarehouseClient from './handlers/dbt/getWarehouseClient';
import { dbtRunHandler } from './handlers/dbt/run';

const mocks = vi.hoisted(() => ({
    spawn: vi.fn(),
    config: vi.fn(),
    token: vi.fn(),
}));
vi.mock('execa', () => ({ default: mocks.spawn }));
vi.mock('./config', () => ({ getConfig: mocks.config }));
vi.mock('./agentConnections/agentTokenProvider', () => ({
    AgentTokenProvider: class {
        getToken = mocks.token;
    },
}));
vi.mock('./analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
vi.mock('./handlers/generate', () => ({ generateHandler: vi.fn() }));
vi.mock('@lightdash/warehouses', () => ({
    warehouseClientFromCredentials: () => ({}),
}));
const slot = slotFixture();
slot.lastReported.approvedProjects = [
    {
        projectUuid: '44444444-4444-4444-8444-444444444444',
        name: null,
        approvedCapabilities: [],
    },
];
slot.lastReported.effectiveProjects = [
    { projectUuid: '44444444-4444-4444-8444-444444444444', capabilities: [] },
];
const options = {} as DbtCompileOptions;
const pipes = { all: true, stdio: ['pipe', 'pipe', 'pipe'] };
const sites: { name: string; call: () => Promise<unknown>; args: unknown[] }[] =
    [
        {
            name: 'dbt run',
            call: () => {
                const parent = new Command();
                parent.args = ['run'];
                return dbtRunHandler(
                    { assumeNo: true } as Parameters<typeof dbtRunHandler>[0],
                    parent.command('run'),
                );
            },
            args: ['dbt', ['run'], { stdio: 'inherit' }],
        },
        {
            name: 'dbt compile',
            call: () =>
                maybeCompileModelsAndJoins(
                    { targetDir: '/missing' } as Parameters<
                        typeof maybeCompileModelsAndJoins
                    >[0],
                    options,
                ),
            args: ['dbt', ['compile']],
        },
        {
            name: 'dbt list',
            call: () => dbtList(options),
            args: [
                'dbt',
                [
                    'ls',
                    '--output',
                    'json',
                    '--output-keys',
                    'unique_id',
                    '--quiet',
                ],
            ],
        },
        {
            name: 'model filter',
            call: () =>
                getCompiledModels([], { select: ['orders'] } as Parameters<
                    typeof getCompiledModels
                >[1]),
            args: [
                'dbt',
                [
                    'ls',
                    '--select',
                    'orders',
                    '--resource-type=model',
                    '--output=json',
                ],
            ],
        },
        {
            name: 'dbt version',
            call: () => getDbtVersion(),
            args: ['dbt', ['--version'], pipes],
        },
        {
            name: 'dbt target',
            call: () =>
                getDbtProfileTargetName({
                    isDbtCloudCLI: true,
                    profilesDir: '.',
                    profile: 'test',
                }),
            args: ['dbt', ['environment', 'show'], pipes],
        },
        {
            name: 'dbt warehouse',
            call: () =>
                getWarehouseClient({
                    isDbtCloudCLI: true,
                    profilesDir: '.',
                    profile: 'test',
                }),
            args: ['dbt', ['environment', 'show'], pipes],
        },
    ];
beforeEach(() => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    vi.stubEnv('LIGHTDASH_API_KEY', 'human-key');
    vi.stubEnv('LIGHTDASH_DBT_VERSION', '1.9.0');
    vi.stubEnv('PRESERVED_CHILD_VALUE', 'keep');
    mocks.config.mockReset().mockResolvedValue({
        context: { serverUrl: slot.instanceUrl, apiKey: 'stored-key' },
        user: {
            userUuid: slot.personUuid,
            organizationUuid: slot.organizationUuid,
        },
    });
    mocks.token.mockReset().mockResolvedValue(slot);
    mocks.spawn.mockReset().mockResolvedValue({
        stdout: '',
        stderr: '',
        all: 'installed: 1.9.0\nTarget name test\nConnection type postgres',
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});
describe.each(sites)('$name', (site) => {
    beforeEach(() => {
        if (site.name === 'dbt version')
            vi.stubEnv('LIGHTDASH_DBT_VERSION', undefined);
    });
    it('keeps the exact ordinary spawn arguments', async () => {
        await site.call();
        expect(mocks.spawn.mock.calls).toEqual([site.args]);
        expect(mocks.token).not.toHaveBeenCalled();
    });
    it.each(['flag', 'environment'])(
        'resolves before spawn and filters only the human key for %s selection',
        async (source) => {
            let release!: () => void;
            const pending = new Promise<void>((resolve) => {
                release = resolve;
            });
            mocks.token.mockImplementation(async () => {
                await pending;
                return slot;
            });
            if (source === 'environment')
                vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', slot.name);
            const execution =
                source === 'flag'
                    ? runWithAgentConnectionSelection(slot.name, site.call)
                    : site.call();
            await vi.waitFor(() => expect(mocks.token).toHaveBeenCalled());
            expect(mocks.spawn).not.toHaveBeenCalled();
            release();
            await execution;
            expect(mocks.spawn).toHaveBeenCalledTimes(1);
            const [command, args, childOptions] = mocks.spawn.mock.calls[0];
            expect([command, args]).toEqual(site.args.slice(0, 2));
            const { LIGHTDASH_API_KEY: _humanKey, ...expectedEnv } =
                process.env;
            expect(childOptions).toEqual({
                ...(site.args[2] as object),
                extendEnv: false,
                env: {
                    ...expectedEnv,
                    LIGHTDASH_AGENT_CONNECTION: slot.name,
                },
            });
        },
    );
    it('does not spawn with an unusable slot', async () => {
        mocks.token.mockRejectedValue(
            new Error(
                'No agent connection credential. Run lightdash agent connect.',
            ),
        );
        await expect(
            runWithAgentConnectionSelection('missing', site.call),
        ).rejects.toThrow('No agent connection credential');
        expect(mocks.spawn).not.toHaveBeenCalled();
    });
});
