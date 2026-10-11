import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { slotFixture } from '../../agentConnections/fixtures';
import { runWithAgentConnectionSelection } from '../../credentials';
import { readBundleFromDir, writeBundleToDir } from './appCodeFiles';
import { validateDataAppBuild } from './validate';

const mocks = vi.hoisted(() => ({
    spawn: vi.fn(),
    token: vi.fn(),
    config: vi.fn(),
}));
vi.mock('execa', () => ({ default: mocks.spawn }));
vi.mock('../../config', () => ({ getConfig: mocks.config }));
vi.mock('../../agentConnections/agentTokenProvider', () => ({
    AgentTokenProvider: class {
        getToken = mocks.token;
    },
}));
const slot = slotFixture();
let dir: string;
beforeEach(async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    vi.stubEnv('LIGHTDASH_API_KEY', 'human-key');
    mocks.spawn.mockReset().mockResolvedValue({});
    mocks.token.mockReset().mockResolvedValue(slot);
    mocks.config.mockReset().mockResolvedValue({
        context: { serverUrl: slot.instanceUrl, apiKey: 'stored-key' },
        user: {
            userUuid: slot.personUuid,
            organizationUuid: slot.organizationUuid,
        },
    });
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-build-'));
    await writeBundleToDir(dir, {
        manifest: {
            codeVersion: 1,
            projectUuid: 'project',
            version: 1,
            name: 'Test',
            description: '',
            template: null,
            downloadedAt: '2026-01-01T00:00:00.000Z',
        },
        files: [],
    });
});
afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
});
describe.each([false, true])('custom dependencies: %s', (custom) => {
    beforeEach(async () => {
        if (custom) {
            await fs.writeFile(
                path.join(dir, 'package.json'),
                JSON.stringify({
                    name: 'test-app',
                    version: '1.0.0',
                    dependencies: { 'left-pad': '1.3.0' },
                }),
            );
            await fs.writeFile(
                path.join(dir, 'pnpm-lock.yaml'),
                "lockfileVersion: '9.0'\npackages:\n  left-pad@1.3.0: {}\n",
            );
        } else await fs.mkdir(path.join(dir, 'node_modules'));
    });
    const run = async () =>
        validateDataAppBuild({
            appDir: dir,
            bundle: await readBundleFromDir(dir),
        });
    it('keeps exact ordinary spawn options', async () => {
        expect(await run()).toEqual([]);
        expect(mocks.spawn.mock.calls).toEqual([
            ...(custom
                ? [
                      [
                          'pnpm',
                          ['install', '--frozen-lockfile', '--ignore-scripts'],
                          {
                              cwd: expect.any(String),
                              env: { CI: 'true' },
                              localDir: undefined,
                              preferLocal: undefined,
                              timeout: 120_000,
                          },
                      ],
                  ]
                : []),
            [
                'vite',
                ['build'],
                {
                    cwd: expect.any(String),
                    env: undefined,
                    localDir: expect.any(String),
                    preferLocal: true,
                    timeout: 60_000,
                },
            ],
        ]);
        expect(mocks.token).not.toHaveBeenCalled();
    });
    it('checks the slot before each spawn and passes an explicit filtered environment', async () => {
        mocks.spawn.mockImplementation(async (_cmd, _args, options) => {
            expect(mocks.token.mock.calls.length).toBe(
                mocks.spawn.mock.calls.length,
            );
            const { LIGHTDASH_API_KEY: _human, ...rest } = process.env;
            expect(options.env).toEqual({
                ...rest,
                ...(_cmd === 'pnpm' ? { CI: 'true' } : {}),
                LIGHTDASH_AGENT_CONNECTION: slot.name,
            });
            expect(options.extendEnv).toBe(false);
        });
        expect(await runWithAgentConnectionSelection(slot.name, run)).toEqual(
            [],
        );
        expect(mocks.spawn).toHaveBeenCalledTimes(custom ? 2 : 1);
    });
    it('does not start a child with a missing slot', async () => {
        mocks.token.mockRejectedValue(
            new Error(
                'No agent connection credential. Run lightdash agent connect.',
            ),
        );
        const issues = await runWithAgentConnectionSelection('missing', run);
        expect(JSON.stringify(issues)).toContain(
            'No agent connection credential',
        );
        expect(mocks.spawn).not.toHaveBeenCalled();
    });
});
