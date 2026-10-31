import {
    DeploySessionStatus,
    LightdashError,
    SupportedDbtAdapter,
    type Explore,
    type LightdashProjectConfig,
} from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';
import { deploy } from './deploy';

vi.mock('./deployMetadata', () => ({
    getDeployMetadata: vi.fn().mockResolvedValue(undefined),
    preflightDeployProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../analytics/analytics');
vi.mock('../config', () => ({
    getConfig: vi.fn(async () => ({ user: null, context: null })),
}));
vi.mock('./dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));

const deployOptions = {
    projectDir: '',
    profilesDir: '',
    target: undefined,
    profile: undefined,
    vars: undefined,
    verbose: false,
    ignoreErrors: false,
    validateWarehouseColumns: false,
    projectUuid: 'project',
    skipWarehouseCatalog: true,
    skipDbtCompile: true,
    useDbtList: false,
    select: undefined,
    models: undefined,
    threads: undefined,
    noVersionCheck: false,
    exclude: undefined,
    selector: undefined,
    state: undefined,
    fullRefresh: false,
    defer: false,
    targetPath: undefined,
    favorState: false,
    combineManifest: undefined,
};

const compiledExplore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    tables: {},
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

const existingParameters = {
    retained: {
        label: 'Retained',
        default: 'before',
        allow_custom_values: true,
    },
};
const replacementParameters = {
    replacement: {
        label: 'Replacement',
        default: 'after',
        allow_custom_values: true,
    },
};

const cases = [
    {
        name: 'absent section',
        yaml: 'spotlight: {}',
        expected: existingParameters,
        writes: false,
    },
    {
        name: 'missing config file',
        yaml: undefined,
        expected: existingParameters,
        writes: false,
    },
    {
        name: 'YAML null',
        yaml: 'parameters:',
        expected: existingParameters,
        writes: false,
    },
    {
        name: 'explicit empty map',
        yaml: 'parameters: {}',
        expected: {},
        writes: true,
    },
    {
        name: 'non-empty map',
        yaml: 'parameters:\n  replacement:\n    label: Replacement\n    default: after\n    allow_custom_values: true',
        expected: replacementParameters,
        writes: true,
    },
];

describe.each(['legacy', 'batched', 'fallback'] as const)(
    'project parameters during %s deploy',
    (mode) => {
        it.each(cases)('$name', async ({ yaml, expected, writes }) => {
            const projectDir = await fs.mkdtemp(
                path.join(os.tmpdir(), 'deploy-parameters-'),
            );
            let storedParameters: LightdashProjectConfig['parameters'] =
                existingParameters;
            const parameterWrites = vi.fn();
            const log = vi
                .spyOn(GlobalState, 'log')
                .mockImplementation(() => undefined);
            vi.mocked(lightdashApi).mockImplementation(
                async ({ method, url, body }) => {
                    if (method === 'PUT' && url.endsWith('/parameters')) {
                        if (typeof body !== 'string') {
                            throw new Error(
                                'Expected a JSON parameter request body',
                            );
                        }
                        try {
                            storedParameters = JSON.parse(body);
                        } catch (error) {
                            throw new Error('Invalid parameter request body', {
                                cause: error,
                            });
                        }
                        parameterWrites(storedParameters);
                    }
                    if (url.endsWith('/deploy') && method === 'POST') {
                        if (mode === 'fallback') {
                            throw new LightdashError({
                                name: 'NotFoundError',
                                statusCode: 404,
                                message: 'not found',
                                data: {},
                            });
                        }
                        return { deploySessionUuid: 'session' } as never;
                    }
                    if (url.endsWith('/batch'))
                        return { exploreCount: 1 } as never;
                    if (url.endsWith('/finalize'))
                        return {
                            status: DeploySessionStatus.COMPLETED,
                            results: { exploreCount: 1 },
                        } as never;
                    if (url.includes('/explores?'))
                        return { exploreCount: 1 } as never;
                    return null as never;
                },
            );
            try {
                if (yaml !== undefined)
                    await fs.writeFile(
                        path.join(projectDir, 'lightdash.config.yml'),
                        yaml,
                    );
                await deploy([compiledExplore], {
                    ...deployOptions,
                    projectDir,
                    batchedDeploy: mode !== 'legacy',
                    complete: true,
                });
                expect(storedParameters).toEqual(expected);
                expect(parameterWrites).toHaveBeenCalledTimes(writes ? 1 : 0);
                if (writes)
                    expect(parameterWrites).toHaveBeenCalledWith(expected);
                else
                    expect(log).toHaveBeenCalledWith(
                        'No parameters section in lightdash.config.yml; project parameters left unchanged (use `parameters: {}` to clear)',
                    );
            } finally {
                log.mockRestore();
                await fs.rm(projectDir, { recursive: true, force: true });
                vi.clearAllMocks();
            }
        });
    },
);
