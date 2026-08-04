import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

type Pm2App = {
    name: string;
    script: string;
    args?: string;
    interpreter?: string;
    node_args?: string;
    autorestart?: boolean;
    watch?: string[];
    ignore_watch?: string[];
};

type Pm2Config = {
    apps: Pm2App[];
};

const requireFromTest = createRequire(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const loadConfig = (relativePath: string): Pm2Config => {
    const configPath = path.join(repoRoot, relativePath);
    delete requireFromTest.cache[requireFromTest.resolve(configPath)];
    return requireFromTest(configPath) as Pm2Config;
};

const expectApiReloadContract = (config: Pm2Config) => {
    const api = config.apps.find(({ name }) => name.endsWith('-api'));
    const routeWatcher = config.apps.find(
        ({ name }) => name === `${api?.name}-routes-watch`,
    );

    expect(api).toMatchObject({
        script: 'src/index.ts',
        interpreter: 'node',
        node_args: expect.stringContaining('--import tsx'),
        autorestart: true,
        watch: ['src'],
        ignore_watch: ['src/generated/swagger.json'],
    });
    expect(routeWatcher).toMatchObject({
        script: 'pnpm',
        args: 'generate-api-dev',
        interpreter: 'none',
        autorestart: true,
    });
};

describe('development PM2 harness', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('watches generated routes and reloads the local API', () => {
        expectApiReloadContract(loadConfig('ecosystem.config.js'));
    });

    it('watches generated routes and reloads agent APIs', () => {
        expectApiReloadContract(
            loadConfig('agent-harness/ecosystem.agent.template.cjs'),
        );
    });

    it('generates routes immediately and cleans up the watcher process', () => {
        const backendPackage = requireFromTest(
            path.join(repoRoot, 'packages/backend/package.json'),
        ) as { scripts: Record<string, string> };
        const fastStart = fs.readFileSync(
            path.join(repoRoot, 'scripts/dev-fast-start.sh'),
            'utf8',
        );

        expect(backendPackage.scripts['generate-api-dev']).toMatch(
            /^pnpm run generate-api:build && chokidar /,
        );
        expect(fastStart).toMatch(
            /for suffix in api api-routes-watch scheduler/,
        );
        expect(fastStart).toContain('API_RELOAD_READY');
        expect(fastStart).toContain('PM2 API predates automatic route reload');
    });
});
