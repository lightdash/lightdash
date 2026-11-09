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
    watch_options?: { followSymlinks?: boolean };
    exp_backoff_restart_delay?: number;
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
        watch: ['src', '../common/dist/cjs/.tsbuildinfo'],
        // ignore_watch replaces chokidar's default node_modules ignore, so the
        // explicit entries + followSymlinks:false guard against restart storms
        // via symlinked node_modules inside src (e.g. mcp-chart-app).
        ignore_watch: [
            'src/generated/swagger.json',
            '**/*.test.ts',
            '**/node_modules',
            '**/node_modules/**',
        ],
        watch_options: { followSymlinks: false },
    });
    // common-watch already builds common, so the watcher calls the backend
    // script directly and backs off instead of crash-looping on a stale build.
    expect(routeWatcher).toMatchObject({
        script: 'pnpm',
        args: '-F backend generate-api-dev',
        interpreter: 'none',
        autorestart: true,
        exp_backoff_restart_delay: 1000,
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

    it('generates routes immediately before watching', () => {
        const backendPackage = requireFromTest(
            path.join(repoRoot, 'packages/backend/package.json'),
        ) as { scripts: Record<string, string> };

        expect(backendPackage.scripts['generate-api-dev']).toMatch(
            /^pnpm run generate-api:build && chokidar /,
        );
    });
});
