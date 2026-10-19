import { QueryHistoryStatus, SupportedDbtVersions } from '@lightdash/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { getConfig, setProject } from '../config';
import { createProject } from './createProject';
import {
    checkLightdashVersion,
    checkProjectCreationPermission,
    lightdashApi,
} from './dbt/apiClient';
import { getDbtVersion } from './dbt/getDbtVersion';
import { refreshHandler } from './dbt/refresh';
import { generateExposuresHandler } from './generateExposures';
import { listProjectsHandler } from './listProjects';
import { renameProjectHandler } from './renameProject';
import { runChartHandler } from './runChart';
import { setWarehouseHandler } from './setWarehouse';
import { sqlHandler } from './sql';
import { warehouseCatalogHandler } from './warehouseCatalog';

vi.mock('../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
vi.mock('../config', () => ({ getConfig: vi.fn(), setProject: vi.fn() }));
vi.mock('./dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
    checkLightdashVersion: vi.fn(),
    checkProjectCreationPermission: vi.fn(),
}));
vi.mock('./dbt/getDbtVersion', () => ({ getDbtVersion: vi.fn() }));
let directory: string;
beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    directory = await fs.mkdtemp(path.join(tmpdir(), 'ordinary-handlers-'));
    vi.mocked(getConfig).mockResolvedValue({
        context: {
            project: 'personal',
            serverUrl: 'https://example.com',
            apiKey: 'personal-key',
        },
    });
    vi.mocked(getDbtVersion).mockResolvedValue({
        versionOption: SupportedDbtVersions.V1_8,
        verboseVersion: '1.8.0',
        isDbtCloudCLI: false,
        isDbtFusion: false,
    });
});
afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(directory, { recursive: true, force: true });
});
it.each(['sql', 'run-chart'] as const)(
    'pins ordinary %s request order and config calls',
    async (command) => {
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({ queryUuid: 'query' } as never)
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.READY,
                columns: {},
                rows: [],
                metadata: { performance: {} },
            } as never);
        const output = path.join(directory, 'rows.csv');
        if (command === 'sql') await sqlHandler('select 1', { output });
        else {
            const input = path.join(directory, 'chart.yml');
            await fs.writeFile(
                input,
                'tableName: orders\nmetricQuery:\n  limit: 10\n',
            );
            await runChartHandler({ path: input, output });
        }
        expect(vi.mocked(getConfig).mock.calls).toEqual([[]]);
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.map(([request]) => [request.method, request.url]),
        ).toEqual([
            [
                'POST',
                `/api/v2/projects/personal/query/${command === 'sql' ? 'sql' : 'metric-query'}`,
            ],
            ['GET', '/api/v2/projects/personal/query/query?pageSize=500'],
        ]);
        expect(setProject).not.toHaveBeenCalled();
        expect(await fs.readFile(output, 'utf8')).toBe('');
    },
);
it('pins ordinary warehouse refresh then catalogue and config calls', async () => {
    vi.mocked(lightdashApi)
        .mockResolvedValueOnce(undefined as never)
        .mockResolvedValueOnce({} as never);
    await warehouseCatalogHandler({
        refresh: true,
        includeFields: false,
        json: true,
        verbose: false,
    });
    expect(vi.mocked(getConfig).mock.calls).toEqual([[]]);
    expect(
        vi
            .mocked(lightdashApi)
            .mock.calls.map(([request]) => [request.method, request.url]),
    ).toEqual([
        ['POST', '/api/v1/projects/personal/sqlRunner/refresh-catalog'],
        ['GET', '/api/v1/projects/personal/sqlRunner/tables'],
    ]);
    expect(setProject).not.toHaveBeenCalled();
});
it('pins ordinary exposures health, config and project request', async () => {
    vi.mocked(lightdashApi).mockResolvedValue({} as never);
    await generateExposuresHandler({
        verbose: false,
        projectDir: directory,
        output: path.join(directory, 'exposures.yml'),
    });
    expect(checkLightdashVersion).toHaveBeenCalledOnce();
    expect(vi.mocked(getConfig).mock.calls).toEqual([[]]);
    expect(lightdashApi).toHaveBeenCalledExactlyOnceWith({
        method: 'GET',
        url: '/api/v1/projects/personal/dbt-exposures',
        body: undefined,
    });
    expect(setProject).not.toHaveBeenCalled();
});
it('pins ordinary project listing without config access', async () => {
    vi.mocked(lightdashApi).mockResolvedValue([] as never);
    await listProjectsHandler({ verbose: false });
    expect(lightdashApi).toHaveBeenCalledExactlyOnceWith({
        method: 'GET',
        url: '/api/v1/org/projects',
        body: undefined,
    });
    expect(getConfig).not.toHaveBeenCalled();
});
it('pins ordinary project rename and its saved default', async () => {
    vi.mocked(lightdashApi).mockResolvedValue({
        projectUuid: 'personal',
        name: 'Renamed',
    } as never);
    await renameProjectHandler({ verbose: false, name: 'Renamed' });
    expect(vi.mocked(getConfig).mock.calls).toEqual([[]]);
    expect(lightdashApi).toHaveBeenCalledExactlyOnceWith({
        method: 'PATCH',
        url: '/api/v1/projects/personal/details',
        body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(setProject).toHaveBeenCalledExactlyOnceWith('personal', 'Renamed');
});
it.each(['refresh', 'set-warehouse'] as const)(
    'keeps ordinary %s health failures ahead of config or requests',
    async (command) => {
        const failure = new Error('health failed');
        vi.mocked(checkLightdashVersion).mockRejectedValue(failure);
        const run =
            command === 'refresh'
                ? refreshHandler({ verbose: false })
                : setWarehouseHandler({
                      verbose: false,
                      projectDir: directory,
                      profilesDir: directory,
                      assumeYes: false,
                  });
        await expect(run).rejects.toBe(failure);
        expect(getConfig).not.toHaveBeenCalled();
        expect(lightdashApi).not.toHaveBeenCalled();
    },
);

it('keeps ordinary create-project permission failures ahead of config and warehouse work', async () => {
    const failure = new Error('permission denied');
    vi.mocked(checkProjectCreationPermission).mockRejectedValue(failure);
    await expect(
        createProject({} as Parameters<typeof createProject>[0]),
    ).rejects.toBe(failure);
    expect(checkProjectCreationPermission).toHaveBeenCalledExactlyOnceWith(
        undefined,
        undefined,
    );
    expect(getConfig).not.toHaveBeenCalled();
    expect(lightdashApi).not.toHaveBeenCalled();
});
