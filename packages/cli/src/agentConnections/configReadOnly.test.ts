import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';

const mocks = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async (original) => ({
    ...(await original<typeof import('os')>()),
    homedir: () => mocks.home,
}));
let configPath: string;
beforeEach(async () => {
    vi.resetModules();
    mocks.home = await fs.mkdtemp(path.join(tmpdir(), 'selected-config-'));
    configPath = path.join(mocks.home, '.config/lightdash/config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'missing');
    vi.stubEnv('LIGHTDASH_URL', 'https://example.com');
    vi.stubEnv('LIGHTDASH_API_KEY', 'personal-must-not-be-used');
});
afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(mocks.home, { recursive: true, force: true });
});

const calls = {
    transport: async () =>
        (await import('../handlers/dbt/apiClient')).lightdashApi({
            method: 'GET',
            url: '/api/v1/user',
            body: undefined,
        }),
    child: async () =>
        (await import('../credentials')).getAgentConnectionChildEnvironment(),
    getProject: async () =>
        (await import('../handlers/getProject')).getProjectHandler({
            verbose: false,
        }),
    warehouse: async () =>
        (await import('../handlers/warehouseCatalog')).warehouseCatalogHandler({
            verbose: false,
            json: true,
            includeFields: false,
            refresh: false,
        }),
    sql: async () =>
        (await import('../handlers/sql')).sqlHandler('select 1', {
            output: 'json',
        }),
    projectConfig: async () =>
        (await import('../lightdash-config')).readAndLoadLightdashProjectConfig(
            mocks.home,
        ),
};

it.each(
    Object.entries(calls).flatMap(([name, run]) =>
        [true, false].map((exists) => ({ name, run, exists })),
    ),
)(
    '$name preserves config bytes and existence (exists=$exists)',
    async ({ run, exists }) => {
        const contents = yaml.dump({
            user: {
                userUuid: '22222222-2222-4222-8222-222222222222',
                organizationUuid: '11111111-1111-4111-8111-111111111111',
            },
            context: { serverUrl: 'https://example.com' },
        });
        if (exists) await fs.writeFile(configPath, contents);
        await run().catch(() => undefined);
        if (exists)
            expect(await fs.readFile(configPath, 'utf8')).toBe(contents);
        else
            await expect(fs.stat(configPath)).rejects.toMatchObject({
                code: 'ENOENT',
            });
    },
);
