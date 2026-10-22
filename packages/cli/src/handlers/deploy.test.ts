import {
    DeploySessionStatus,
    LightdashError,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/analytics';
import { runWithAgentConnectionSelection } from '../credentials';
import GlobalState from '../globalState';
import { readAndLoadLightdashProjectConfig } from '../lightdash-config';
import { lightdashApi } from './dbt/apiClient';
import { deploy } from './deploy';

vi.mock('./deployMetadata', () => ({
    getDeployMetadata: vi.fn().mockResolvedValue(undefined),
    preflightDeployProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../analytics/analytics');
vi.mock('../lightdash-config');
vi.mock('./dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));

const compiledExplore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    tables: {},
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

const deployOptions = {
    projectDir: '/tmp/project',
    profilesDir: '',
    target: undefined,
    profile: undefined,
    vars: undefined,
    verbose: false,
    ignoreErrors: false,
    validateWarehouseColumns: false,
    projectUuid: 'project-uuid',
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

describe('deploy completeness transport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(readAndLoadLightdashProjectConfig).mockResolvedValue({
            spotlight: { default_visibility: 'show' },
        });
        vi.mocked(LightdashAnalytics.track).mockResolvedValue(undefined);
    });

    describe.each(['full', 'absent'] as const)(
        'rejected deploy with %s configuration',
        (config) => {
            test.each(['batched', 'inventory', 'legacy'] as const)(
                'preserves project configuration and explores through %s transport',
                async (transport) => {
                    vi.mocked(
                        readAndLoadLightdashProjectConfig,
                    ).mockResolvedValue({
                        spotlight: {
                            default_visibility: 'show',
                            ...(config === 'full'
                                ? {
                                      categories: {
                                          payments: {
                                              label: 'Payments',
                                              color: 'blue',
                                          },
                                      },
                                  }
                                : {}),
                        },
                        ...(config === 'full'
                            ? {
                                  parameters: {
                                      minimum_amount: {
                                          label: 'Minimum amount',
                                          type: 'number',
                                          default: 0,
                                      },
                                  },
                                  defaults: { case_sensitive: false },
                                  table_groups: {
                                      commerce: { label: 'Commerce' },
                                  },
                              }
                            : {}),
                    });
                    const project = new Map([
                        ['tags/yaml', '[{"name":"Existing tag"}]'],
                        ['parameters', '{"existing":{"default":1}}'],
                        ['defaults', '{"case_sensitive":true}'],
                        ['table-groups', '{"existing":{"label":"Existing"}}'],
                        ['explores', JSON.stringify([compiledExplore])],
                    ]);
                    const before = new Map(project);
                    const failure = new LightdashError({
                        name: 'ConflictError',
                        statusCode: 409,
                        message:
                            'This deploy was not saved and nothing in the project changed.',
                        data: {},
                    });
                    vi.mocked(lightdashApi).mockImplementation(
                        async ({ url, method, body }) => {
                            for (const key of project.keys()) {
                                if (
                                    url.endsWith(`/${key}`) &&
                                    typeof body === 'string'
                                ) {
                                    project.set(key, body);
                                    return null as never;
                                }
                            }
                            if (url.endsWith('/finalize') || method === 'PUT')
                                throw failure;
                            if (url.endsWith('/deploy'))
                                return {
                                    deploySessionUuid: 'deploy-session-uuid',
                                } as never;
                            return {
                                batchNumber: 0,
                                exploreCount: 1,
                            } as never;
                        },
                    );

                    await expect(
                        deploy([compiledExplore], {
                            ...deployOptions,
                            complete: true,
                            batchedDeploy: transport === 'batched',
                            dbtModelNames:
                                transport === 'legacy'
                                    ? undefined
                                    : ['analytics__orders'],
                        }),
                    ).rejects.toBe(failure);

                    expect(project).toEqual(before);
                    expect(lightdashApi).not.toHaveBeenCalledWith(
                        expect.objectContaining({
                            url: expect.stringMatching(
                                /\/(tags\/yaml|parameters|defaults|table-groups)$/,
                            ),
                        }),
                    );
                },
            );
        },
    );

    test.each(['batched', 'inventory', 'legacy'] as const)(
        'saves configuration after the %s deploy succeeds',
        async (transport) => {
            vi.mocked(readAndLoadLightdashProjectConfig).mockResolvedValue({
                spotlight: { default_visibility: 'show' },
                parameters: {},
                defaults: { case_sensitive: false },
                table_groups: {},
            });
            const requests: string[] = [];
            vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
                requests.push(url);
                if (url.endsWith('/deploy') && transport === 'batched')
                    return {
                        deploySessionUuid: 'deploy-session-uuid',
                    } as never;
                return {
                    batchNumber: 0,
                    exploreCount: 1,
                    warnings: { warningCount: 0, exploresWithWarnings: [] },
                    status: DeploySessionStatus.COMPLETED,
                } as never;
            });

            await deploy([compiledExplore], {
                ...deployOptions,
                complete: true,
                batchedDeploy: transport === 'batched',
                dbtModelNames:
                    transport === 'legacy' ? undefined : ['analytics__orders'],
            });

            expect(requests.slice(-4)).toEqual([
                '/api/v1/projects/project-uuid/tags/yaml',
                '/api/v2/projects/project-uuid/parameters',
                '/api/v2/projects/project-uuid/defaults',
                '/api/v1/projects/project-uuid/table-groups',
            ]);
            const deployUrls = {
                batched:
                    '/api/v2/projects/project-uuid/deploy/deploy-session-uuid/finalize',
                inventory: '/api/v2/projects/project-uuid/deploy',
                legacy: '/api/v1/projects/project-uuid/explores?complete=true',
            };
            expect(requests.at(-5)).toBe(deployUrls[transport]);
        },
    );

    it.each([
        { complete: true, expected: 'true' },
        { complete: false, expected: 'false' },
        { complete: undefined, expected: 'false' },
    ])(
        'sends complete=$expected when batched deploy is disabled',
        async ({ complete, expected }) => {
            vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
                if (url.includes('/explores?')) {
                    return {
                        exploreCount: 1,
                        warnings: {
                            warningCount: 0,
                            exploresWithWarnings: [],
                        },
                    } as never;
                }
                return null as never;
            });

            await deploy([compiledExplore], {
                ...deployOptions,
                complete,
                batchedDeploy: false,
            });

            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'PUT',
                    url: `/api/v1/projects/project-uuid/explores?complete=${expected}`,
                    body: JSON.stringify([compiledExplore]),
                }),
            );
        },
    );

    test('sends the full model inventory with a selective single-request deploy', async () => {
        vi.mocked(lightdashApi).mockResolvedValue(null as never);
        const dbtModelNames = ['orders', 'customers'];

        await deploy([compiledExplore], {
            ...deployOptions,
            batchedDeploy: false,
            complete: false,
            dbtModelNames,
        });

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'PUT',
            url: '/api/v2/projects/project-uuid/deploy',
            body: JSON.stringify({
                explores: [compiledExplore],
                dbtModelNames,
                complete: false,
            }),
        });
    });

    test('retries the array payload with a warning when an older server lacks the inventory endpoint', async () => {
        const warning = vi.spyOn(GlobalState, 'log');
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url === '/api/v2/projects/project-uuid/deploy') {
                throw new LightdashError({
                    message: 'Not found',
                    name: 'NotFoundError',
                    statusCode: 404,
                    data: {},
                });
            }
            return null as never;
        });

        await deploy([compiledExplore], {
            ...deployOptions,
            batchedDeploy: false,
            dbtModelNames: ['orders', 'customers'],
        });

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'PUT',
            url: '/api/v1/projects/project-uuid/explores?complete=false',
            body: JSON.stringify([compiledExplore]),
        });
        expect(warning).toHaveBeenCalledWith(
            expect.stringContaining(
                'does not support deleted dbt model cleanup',
            ),
        );
        warning.mockRestore();
    });

    test.each([422, 500])(
        'does not retry inventory deployment after HTTP %s',
        async (statusCode) => {
            const serverError = new LightdashError({
                message: 'Unavailable',
                name: 'InternalServerError',
                statusCode,
                data: {},
            });
            vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
                if (url === '/api/v2/projects/project-uuid/deploy') {
                    throw serverError;
                }
                return null as never;
            });

            await expect(
                deploy([compiledExplore], {
                    ...deployOptions,
                    batchedDeploy: false,
                    dbtModelNames: ['orders'],
                }),
            ).rejects.toBe(serverError);
            expect(
                vi
                    .mocked(lightdashApi)
                    .mock.calls.filter(
                        ([request]) =>
                            request.url ===
                            '/api/v2/projects/project-uuid/deploy',
                    ),
            ).toHaveLength(1);
        },
    );

    test('uses batched deploy by default and includes the completeness assertion in every batch body', async () => {
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/deploy')) {
                return {
                    deploySessionUuid: 'deploy-session-uuid',
                } as never;
            }
            if (url.endsWith('/batch')) {
                return { batchNumber: 0, exploreCount: 1 } as never;
            }
            if (url.endsWith('/finalize')) {
                return {
                    exploreCount: 1,
                    warnings: {
                        warningCount: 0,
                        exploresWithWarnings: [],
                    },
                    status: DeploySessionStatus.COMPLETED,
                } as never;
            }
            return null as never;
        });

        await deploy([compiledExplore], {
            ...deployOptions,
            complete: false,
            dbtModelNames: ['orders', 'customers'],
        });

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'POST',
            url: '/api/v2/projects/project-uuid/deploy/deploy-session-uuid/batch',
            body: JSON.stringify({
                explores: [compiledExplore],
                batchNumber: 0,
                complete: false,
            }),
        });
        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'POST',
            url: '/api/v2/projects/project-uuid/deploy/deploy-session-uuid/finalize',
            body: JSON.stringify({ dbtModelNames: ['orders', 'customers'] }),
        });
    });

    test('propagates a 409 from finalize without retrying or falling back', async () => {
        const failure = new LightdashError({
            name: 'ConflictError',
            statusCode: 409,
            message:
                'This deploy was not saved and nothing in the project changed.\nGive each dbt project a distinct name in dbt_project.yml.',
            data: {},
        });
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/deploy'))
                return { deploySessionUuid: 'deploy-session-uuid' } as never;
            if (url.endsWith('/batch'))
                return { batchNumber: 0, exploreCount: 1 } as never;
            if (url.endsWith('/finalize')) throw failure;
            return null as never;
        });
        await expect(
            deploy([compiledExplore], { ...deployOptions, complete: true }),
        ).rejects.toBe(failure);
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(([request]) =>
                    request.url.endsWith('/finalize'),
                ),
        ).toHaveLength(1);
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(
                    ([request]) =>
                        request.method === 'PUT' &&
                        request.url.includes('/explores'),
                ),
        ).toHaveLength(0);
    });

    test('falls back to the legacy deploy when session creation returns 404', async () => {
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/deploy')) {
                throw new LightdashError({
                    message: 'Not found',
                    name: 'NotFoundError',
                    statusCode: 404,
                    data: {},
                });
            }
            if (url.includes('/explores?')) {
                return {
                    exploreCount: 1,
                    warnings: {
                        warningCount: 0,
                        exploresWithWarnings: [],
                    },
                } as never;
            }
            return null as never;
        });

        await deploy([compiledExplore], deployOptions);

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'PUT',
            url: '/api/v1/projects/project-uuid/explores?complete=false',
            body: JSON.stringify([compiledExplore]),
        });
    });

    test('propagates non-404 session creation errors', async () => {
        const serverError = new LightdashError({
            message: 'Server unavailable',
            name: 'InternalServerError',
            statusCode: 500,
            data: {},
        });
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/deploy')) {
                throw serverError;
            }
            return null as never;
        });

        await expect(deploy([compiledExplore], deployOptions)).rejects.toBe(
            serverError,
        );

        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'PUT',
                url: expect.stringContaining('/explores?'),
            }),
        );
    });
});

describe('deploy dbt source and target transport', () => {
    const batchedResponses = async ({ url }: { url: string }) => {
        if (url.endsWith('/deploy')) {
            return { deploySessionUuid: 'deploy-session-uuid' } as never;
        }
        if (url.endsWith('/batch')) {
            return { batchNumber: 0, exploreCount: 1 } as never;
        }
        if (url.endsWith('/finalize')) {
            return {
                exploreCount: 1,
                warnings: { warningCount: 0, exploresWithWarnings: [] },
                status: DeploySessionStatus.COMPLETED,
            } as never;
        }
        return null as never;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(readAndLoadLightdashProjectConfig).mockResolvedValue({
            spotlight: { default_visibility: 'show' },
        });
        vi.mocked(LightdashAnalytics.track).mockResolvedValue(undefined);
    });

    test('sends the dbt source and the dbt target when the batched deploy finalizes', async () => {
        vi.mocked(lightdashApi).mockImplementation(batchedResponses);

        await deploy([compiledExplore], {
            ...deployOptions,
            complete: true,
            sourceUuid: 'finance-source-uuid',
            deployTarget: { database: 'finance', region: 'eu-west-1' },
        });

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'POST',
            url: '/api/v2/projects/project-uuid/deploy/deploy-session-uuid/finalize',
            body: JSON.stringify({
                sourceUuid: 'finance-source-uuid',
                target: { database: 'finance', region: 'eu-west-1' },
            }),
        });
    });

    test('sends the dbt source and the dbt target with a single-request deploy', async () => {
        vi.mocked(lightdashApi).mockResolvedValue(null as never);

        await deploy([compiledExplore], {
            ...deployOptions,
            batchedDeploy: false,
            complete: true,
            dbtModelNames: ['orders'],
            sourceUuid: 'finance-source-uuid',
            deployTarget: { database: 'finance' },
        });

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'PUT',
            url: '/api/v2/projects/project-uuid/deploy',
            body: JSON.stringify({
                explores: [compiledExplore],
                dbtModelNames: ['orders'],
                complete: true,
                sourceUuid: 'finance-source-uuid',
                target: { database: 'finance' },
            }),
        });
    });

    test('sends the dbt source and the dbt target as query parameters to the array endpoint', async () => {
        vi.mocked(lightdashApi).mockResolvedValue(null as never);

        await deploy([compiledExplore], {
            ...deployOptions,
            batchedDeploy: false,
            complete: true,
            sourceUuid: 'finance-source-uuid',
            deployTarget: { database: 'fin ance', region: 'eu-west-1' },
        });

        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'PUT',
                url: '/api/v1/projects/project-uuid/explores?complete=true&sourceUuid=finance-source-uuid&targetDatabase=fin%20ance&targetRegion=eu-west-1',
            }),
        );
    });
});

describe('selected deploy writes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'work');
        vi.mocked(readAndLoadLightdashProjectConfig).mockResolvedValue({
            spotlight: { default_visibility: 'show' },
        });
        vi.mocked(LightdashAnalytics.track).mockResolvedValue(undefined);
    });
    afterEach(() => vi.unstubAllEnvs());
    it('does not retry a failed batch', async () => {
        let attempts = 0;
        const failure = new Error('Connection failed');
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/deploy'))
                return {
                    deploySessionUuid: '55555555-5555-4555-8555-555555555555',
                } as never;
            if (url.endsWith('/batch')) {
                attempts += 1;
                if (attempts === 1) throw failure;
                return { batchNumber: 0, exploreCount: 1 } as never;
            }
            if (url.endsWith('/finalize'))
                return {
                    exploreCount: 1,
                    status: DeploySessionStatus.COMPLETED,
                    warnings: { warningCount: 0, exploresWithWarnings: [] },
                } as never;
            return null as never;
        });
        await expect(deploy([compiledExplore], deployOptions)).rejects.toBe(
            failure,
        );
        expect(attempts).toBe(1);
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.some(([props]) => props.url.endsWith('/finalize')),
        ).toBe(false);
    });
    it.each([
        { sourceUuid: 'source' },
        { deployTarget: { database: 'other' } },
    ])(
        'refuses direct deploy destination overrides %j before requests',
        async (override) => {
            await expect(
                deploy([compiledExplore], { ...deployOptions, ...override }),
            ).rejects.toThrow('not available');
            expect(lightdashApi).not.toHaveBeenCalled();
        },
    );
});

it('does not fall back to another deploy write after a selected legacy 404', async () => {
    vi.clearAllMocks();
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'work');
    vi.mocked(readAndLoadLightdashProjectConfig).mockResolvedValue({
        spotlight: { default_visibility: 'show' },
    });
    const failure = new LightdashError({
        name: 'NotFoundError',
        statusCode: 404,
        message: 'missing',
        data: {},
    });
    vi.mocked(lightdashApi).mockImplementation(async ({ method, url }) => {
        if (method === 'PUT' && url.endsWith('/deploy')) throw failure;
        return null as never;
    });
    try {
        await expect(
            deploy([compiledExplore], {
                ...deployOptions,
                batchedDeploy: false,
                dbtModelNames: ['orders'],
            }),
        ).rejects.toBe(failure);
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.some(([props]) => props.url.includes('/explores?')),
        ).toBe(false);
    } finally {
        vi.unstubAllEnvs();
    }
});

it('prints fixed guidance for server deploy warnings on connection requests', async () => {
    vi.mocked(readAndLoadLightdashProjectConfig).mockResolvedValue({
        spotlight: { default_visibility: 'show' },
    });
    vi.mocked(lightdashApi).mockResolvedValue({
        warnings: {
            warningCount: 1,
            exploresWithWarnings: [
                {
                    name: 'unseen server marker!',
                    warnings: [{ message: 'unseen server marker!' }],
                },
            ],
        },
    } as never);
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        await runWithAgentConnectionSelection('default', () =>
            deploy([compiledExplore], {
                ...deployOptions,
                batchedDeploy: false,
            }),
        );
        expect(output.mock.calls.flat().join('\n')).not.toContain(
            'unseen server marker!',
        );
        expect(output.mock.calls.flat().join('\n')).toContain(
            'The server reported compilation warnings. Review the project in the app.',
        );
    } finally {
        output.mockRestore();
    }
});
