// Stub the e2b/ai SDKs before importing AppGenerateService so the tests never
// reach the real sandbox or model client.
import {
    DATA_APP_VIZ_TEMPLATE,
    dataAppVizSchema,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    type ChartRegistryEntry,
    type ChartRegistryIndex,
    type DataAppVizSchema,
    type SessionUser,
} from '@lightdash/common';
import { DatabaseError } from 'pg';
import { pack } from 'tar-stream';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));
vi.mock('./appAuthz', () => ({
    assertCanViewApp: vi.fn().mockResolvedValue({ directOnly: false } as never),
}));

// ── fixtures ────────────────────────────────────────────────────────────────

const PROJECT_UUID = 'project-uuid-5678';
const ORG_UUID = 'org-uuid-abcd';
const REGISTRY_BASE_URL = 'https://registry.example.com';

const VIZ_SCHEMA: DataAppVizSchema = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
        },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
};
// `installRegistryChartType` re-validates entry.vizSchema with
// dataAppVizSchema.safeParse and stores the parsed (default-filled) result.
const PARSED_VIZ_SCHEMA = dataAppVizSchema.parse(VIZ_SCHEMA);

function makeEntry(
    overrides: Partial<ChartRegistryEntry> = {},
): ChartRegistryEntry {
    return {
        slug: 'sankey',
        name: 'Sankey Diagram',
        description: 'A sankey chart',
        version: '1.3.0',
        publishedAt: '2026-08-01T00:00:00Z',
        tags: [],
        changelog: '',
        minLightdashVersion: null,
        vizSchema: VIZ_SCHEMA,
        thumbnail: null,
        screenshots: [],
        artifacts: {
            source: { path: 'sankey/1.3.0/source.tar', sha256: 'a'.repeat(64) },
            dist: { path: 'sankey/1.3.0/dist.tar', sha256: 'b'.repeat(64) },
        },
        ...overrides,
    };
}

const SANKEY_ENTRY = makeEntry();
const RADAR_ENTRY = makeEntry({
    slug: 'radar',
    name: 'Radar Chart',
    version: '1.0.0',
});

function makeIndex(charts: ChartRegistryEntry[]): ChartRegistryIndex {
    return { schemaVersion: 1, generatedAt: '2026-08-01T00:00:00Z', charts };
}

const fakeUser: SessionUser = {
    userId: 1,
    userUuid: 'user-uuid',
    email: 'test@lightdash.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: ORG_UUID,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    isSetupComplete: true,
    role: OrganizationMemberRole.ADMIN,
    ability: { can: () => true, cannot: () => false } as never,
    abilityRules: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    timezone: null,
};

/** Build a real tar buffer from a list of {name, content} entries via tar-stream pack(). */
async function buildTar(
    entries: { name: string; content: string }[],
): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const p = pack();
        const chunks: Buffer[] = [];
        p.on('data', (c: Buffer) => chunks.push(c));
        p.on('end', () => resolve(Buffer.concat(chunks)));
        p.on('error', reject);

        const addNext = (index: number): void => {
            if (index >= entries.length) {
                p.finalize();
                return;
            }
            const entry = entries[index];
            p.entry({ name: entry.name }, entry.content, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                addNext(index + 1);
            });
        };
        addNext(0);
    });
}

/** A real `pg` DatabaseError carrying the given SQLSTATE code, matching how `isUniqueConstraintViolation` detects it. */
const databaseError = (code: string): DatabaseError => {
    const error = new DatabaseError(`database error ${code}`, 0, 'error');
    error.code = code;
    return error;
};

type FakeCommand = {
    constructor: { name: string };
    input: Record<string, unknown>;
};

/** Stateful fake S3 client tracking PutObject writes so ListObjectsV2/DeleteObjects (used for cleanup) behave realistically. */
function makeFakeS3() {
    const objects = new Map<string, unknown>();
    const send = vi.fn(async (command: FakeCommand) => {
        const cmdName = command.constructor.name;
        if (cmdName === 'PutObjectCommand') {
            const { Key, Body } = command.input as {
                Key: string;
                Body: unknown;
            };
            objects.set(Key, Body);
            return {};
        }
        if (cmdName === 'ListObjectsV2Command') {
            const { Prefix } = command.input as { Prefix: string };
            const keys = [...objects.keys()].filter((k) =>
                k.startsWith(Prefix),
            );
            return {
                Contents: keys.map((Key) => ({ Key })),
                IsTruncated: false,
            };
        }
        if (cmdName === 'DeleteObjectsCommand') {
            const { Delete } = command.input as {
                Delete: { Objects: { Key: string }[] };
            };
            Delete.Objects.forEach(({ Key }) => objects.delete(Key));
            return {};
        }
        throw new Error(`Unexpected command: ${cmdName}`);
    });
    return { client: { send } as never, bucket: 'test-bucket', send, objects };
}

// ── service factory ──────────────────────────────────────────────────────────

const analyticsTrackSpy = vi.fn();

function buildService(overrides: {
    appModel?: Record<string, unknown>;
    projectModel?: Record<string, unknown>;
    chartRegistryClient?: Record<string, unknown>;
    s3ClientOverride?: { client: never; bucket: string };
    ability?: { can: () => boolean; cannot: () => boolean };
    // Per-featureFlagId overrides; any flag not listed defaults to enabled.
    featureFlags?: Partial<Record<string, boolean>>;
}): AppGenerateService {
    const {
        appModel = {},
        projectModel = {},
        chartRegistryClient = {},
        s3ClientOverride,
        ability = { can: () => true, cannot: () => false },
        featureFlags = {},
    } = overrides;

    const fullAppModel = {
        listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
        ...appModel,
    };

    const fullProjectModel = {
        getSummary: vi.fn().mockResolvedValue({ organizationUuid: ORG_UUID }),
        ...projectModel,
    };

    const fullChartRegistryClient = {
        isEnabled: () => true,
        getBaseUrl: () => REGISTRY_BASE_URL,
        getIndex: vi
            .fn()
            .mockResolvedValue(makeIndex([SANKEY_ENTRY, RADAR_ENTRY])),
        getEntry: vi.fn().mockResolvedValue(SANKEY_ENTRY),
        downloadArtifact: vi.fn(),
        ...chartRegistryClient,
    };

    const featureFlagModel = {
        get: vi
            .fn()
            .mockImplementation(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    enabled: featureFlags[featureFlagId] ?? true,
                }),
            ),
    };
    const spacePermissionService = {
        resolveAccess: vi.fn().mockResolvedValue({}),
    };

    const svc = new AppGenerateService({
        lightdashConfig: {} as never,
        analytics: { track: analyticsTrackSpy } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: fullAppModel as never,
        featureFlagModel: featureFlagModel as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: fullProjectModel as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: spacePermissionService as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        chartRegistryClient: fullChartRegistryClient as never,
        sandboxManager: null,
        appRuntimeS3: null,
    });

    vi.spyOn(
        svc as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue(ability);

    if (s3ClientOverride) {
        vi.spyOn(
            svc as unknown as { getS3Client: () => unknown },
            'getS3Client',
        ).mockReturnValue(s3ClientOverride);
    }

    return svc;
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    analyticsTrackSpy.mockClear();
});

describe('AppGenerateService.listRegistryChartTypes', () => {
    it('returns registryEnabled false when the client is disabled', async () => {
        const svc = buildService({
            chartRegistryClient: { isEnabled: () => false },
        });

        const result = await svc.listRegistryChartTypes(fakeUser, PROJECT_UUID);

        expect(result).toEqual({ registryEnabled: false, charts: [] });
    });

    it('merges install state', async () => {
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([
                {
                    app_id: 'app-uuid-sankey',
                    registry_slug: 'sankey',
                    latest_ready_registry_version: '1.2.0',
                    created_by_user_uuid: 'installer-user-uuid',
                },
            ]),
        };
        const svc = buildService({ appModel });

        const result = await svc.listRegistryChartTypes(fakeUser, PROJECT_UUID);

        expect(result.registryEnabled).toBe(true);
        const sankey = result.charts.find((c) => c.slug === 'sankey');
        expect(sankey?.state).toBe('update_available');
        expect(sankey?.installedAppUuid).toBe('app-uuid-sankey');
        expect(sankey?.installedRegistryVersion).toBe('1.2.0');
        expect(sankey?.installedCreatedByUserUuid).toBe('installer-user-uuid');

        const radar = result.charts.find((c) => c.slug === 'radar');
        expect(radar?.state).toBe('not_installed');
        expect(radar?.installedAppUuid).toBeNull();
        expect(radar?.installedRegistryVersion).toBeNull();
        expect(radar?.installedCreatedByUserUuid).toBeNull();
    });

    it('marks entries above the instance version incompatible', async () => {
        const futureEntry = makeEntry({
            slug: 'future-chart',
            minLightdashVersion: '999.0.0',
        });
        const svc = buildService({
            chartRegistryClient: {
                getIndex: vi.fn().mockResolvedValue(makeIndex([futureEntry])),
            },
        });

        const result = await svc.listRegistryChartTypes(fakeUser, PROJECT_UUID);

        expect(result.charts).toHaveLength(1);
        expect(result.charts[0].state).toBe('incompatible');
        expect(result.charts[0].installedAppUuid).toBeNull();
        expect(result.charts[0].installedCreatedByUserUuid).toBeNull();
    });
});

describe('AppGenerateService.installRegistryChartType', () => {
    it('fresh install: uploads source.tar + extracted dist, creates ready v1 with provenance', async () => {
        const sourceTar = await buildTar([
            { name: 'src/App.tsx', content: 'export default function App(){}' },
        ]);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html></html>' },
            { name: 'dist/assets/app.js', content: 'console.log(1)' },
        ]);
        const fakeS3 = makeFakeS3();
        const createWithVersion = vi.fn().mockResolvedValue(undefined);
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
            createWithVersion,
        };
        const chartRegistryClient = {
            downloadArtifact: vi
                .fn()
                .mockImplementation(
                    (_entry: unknown, kind: 'source' | 'dist') =>
                        Promise.resolve(
                            kind === 'source' ? sourceTar : distTar,
                        ),
                ),
        };
        const svc = buildService({
            appModel,
            chartRegistryClient,
            s3ClientOverride: fakeS3,
        });

        const result = await svc.installRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            'sankey',
        );

        expect(result.action).toBe('installed');
        expect(result.slug).toBe('sankey');
        expect(result.version).toBe(1);

        const putKeys = fakeS3.send.mock.calls
            .map(([cmd]) => cmd as FakeCommand)
            .filter((cmd) => cmd.constructor.name === 'PutObjectCommand')
            .map((cmd) => (cmd.input as { Key: string }).Key);
        expect(putKeys).toEqual(
            expect.arrayContaining([
                `apps/${result.appUuid}/versions/1/source.tar`,
                `apps/${result.appUuid}/versions/1/index.html`,
                `apps/${result.appUuid}/versions/1/assets/app.js`,
            ]),
        );

        expect(createWithVersion).toHaveBeenCalledTimes(1);
        const [appArg, versionArg, statusArg, , , vizSchemaArg, optsArg] =
            createWithVersion.mock.calls[0];
        expect(appArg).toEqual(
            expect.objectContaining({
                app_id: result.appUuid,
                project_uuid: PROJECT_UUID,
                created_by_user_uuid: fakeUser.userUuid,
                name: SANKEY_ENTRY.name,
                description: SANKEY_ENTRY.description,
                slug: 'sankey',
                template: DATA_APP_VIZ_TEMPLATE,
                registry_slug: 'sankey',
                registry_url: REGISTRY_BASE_URL,
            }),
        );
        expect(versionArg).toEqual({ version: 1, prompt: expect.any(String) });
        expect(statusArg).toBe('ready');
        expect(vizSchemaArg).toEqual(PARSED_VIZ_SCHEMA);
        expect(optsArg).toEqual({ registryVersion: '1.3.0' });
    });

    it('already installed at latest → action unchanged, no writes', async () => {
        const fakeS3 = makeFakeS3();
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([
                {
                    app_id: 'existing-app-uuid',
                    registry_slug: 'sankey',
                    latest_ready_registry_version: '1.3.0',
                },
            ]),
            getLatestReadyVersion: vi.fn().mockResolvedValue({ version: 4 }),
            createVersion: vi.fn(),
            createWithVersion: vi.fn(),
        };
        const svc = buildService({ appModel, s3ClientOverride: fakeS3 });

        const result = await svc.installRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            'sankey',
        );

        expect(result).toEqual({
            appUuid: 'existing-app-uuid',
            slug: 'sankey',
            version: 4,
            action: 'unchanged',
        });
        expect(fakeS3.send).not.toHaveBeenCalled();
        expect(appModel.createVersion).not.toHaveBeenCalled();
        expect(appModel.createWithVersion).not.toHaveBeenCalled();
    });

    it('installed at older version → appends new version (action upgraded)', async () => {
        const sourceTar = await buildTar([
            { name: 'src/App.tsx', content: 'x' },
        ]);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
        ]);
        const fakeS3 = makeFakeS3();
        const createVersion = vi.fn().mockResolvedValue({ version: 3 });
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([
                {
                    app_id: 'existing-app-uuid',
                    registry_slug: 'sankey',
                    latest_ready_registry_version: '1.2.0',
                },
            ]),
            getLatestVersion: vi.fn().mockResolvedValue({ version: 2 }),
            createVersion,
        };
        const chartRegistryClient = {
            downloadArtifact: vi
                .fn()
                .mockImplementation(
                    (_entry: unknown, kind: 'source' | 'dist') =>
                        Promise.resolve(
                            kind === 'source' ? sourceTar : distTar,
                        ),
                ),
        };
        const svc = buildService({
            appModel,
            chartRegistryClient,
            s3ClientOverride: fakeS3,
        });

        const result = await svc.installRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            'sankey',
        );

        expect(result).toEqual({
            appUuid: 'existing-app-uuid',
            slug: 'sankey',
            version: 3,
            action: 'upgraded',
        });
        expect(createVersion).toHaveBeenCalledWith(
            'existing-app-uuid',
            { version: 3, prompt: expect.any(String) },
            'ready',
            fakeUser.userUuid,
            undefined,
            undefined,
            PARSED_VIZ_SCHEMA,
            { registryVersion: '1.3.0' },
        );
    });

    it('rejects incompatible entries', async () => {
        const incompatibleEntry = makeEntry({ minLightdashVersion: '999.0.0' });
        const svc = buildService({
            chartRegistryClient: {
                getEntry: vi.fn().mockResolvedValue(incompatibleEntry),
            },
        });

        await expect(
            svc.installRegistryChartType(fakeUser, PROJECT_UUID, 'sankey'),
        ).rejects.toThrow(ParameterError);
    });

    it('unknown slug → NotFoundError', async () => {
        const svc = buildService({
            chartRegistryClient: {
                getEntry: vi.fn().mockResolvedValue(undefined),
            },
        });

        await expect(
            svc.installRegistryChartType(
                fakeUser,
                PROJECT_UUID,
                'unknown-chart',
            ),
        ).rejects.toThrow(NotFoundError);
    });

    it('cleans up copied S3 keys when the DB write fails', async () => {
        const sourceTar = await buildTar([
            { name: 'src/App.tsx', content: 'x' },
        ]);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
        ]);
        const fakeS3 = makeFakeS3();
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
            createWithVersion: vi.fn().mockRejectedValue(new Error('db down')),
        };
        const chartRegistryClient = {
            downloadArtifact: vi
                .fn()
                .mockImplementation(
                    (_entry: unknown, kind: 'source' | 'dist') =>
                        Promise.resolve(
                            kind === 'source' ? sourceTar : distTar,
                        ),
                ),
        };
        const svc = buildService({
            appModel,
            chartRegistryClient,
            s3ClientOverride: fakeS3,
        });

        await expect(
            svc.installRegistryChartType(fakeUser, PROJECT_UUID, 'sankey'),
        ).rejects.toThrow('db down');

        const deleteCalls = fakeS3.send.mock.calls
            .map(([cmd]) => cmd as FakeCommand)
            .filter((cmd) => cmd.constructor.name === 'DeleteObjectsCommand');
        expect(deleteCalls.length).toBeGreaterThan(0);
        expect(fakeS3.objects.size).toBe(0);
    });

    it('concurrent FRESH installs racing on registry_slug: the loser cleans up its own S3 prefix and gets a friendly retry error', async () => {
        // Both installers passed the unlocked listRegistryInstalledApps
        // pre-check (see it below), so neither has `existing` — the DB
        // unique violation is on (project_uuid, registry_slug), not on this
        // loser's own (unshared) app_id/prefix, so cleaning it up is safe.
        const sourceTar = await buildTar([
            { name: 'src/App.tsx', content: 'x' },
        ]);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
        ]);
        const fakeS3 = makeFakeS3();
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
            createWithVersion: vi
                .fn()
                .mockRejectedValue(databaseError('23505')),
        };
        const chartRegistryClient = {
            downloadArtifact: vi
                .fn()
                .mockImplementation(
                    (_entry: unknown, kind: 'source' | 'dist') =>
                        Promise.resolve(
                            kind === 'source' ? sourceTar : distTar,
                        ),
                ),
        };
        const svc = buildService({
            appModel,
            chartRegistryClient,
            s3ClientOverride: fakeS3,
        });

        await expect(
            svc.installRegistryChartType(fakeUser, PROJECT_UUID, 'sankey'),
        ).rejects.toThrow(
            'This chart type was just installed by someone else — refresh',
        );

        const deleteCalls = fakeS3.send.mock.calls
            .map(([cmd]) => cmd as FakeCommand)
            .filter((cmd) => cmd.constructor.name === 'DeleteObjectsCommand');
        expect(deleteCalls.length).toBeGreaterThan(0);
        // The loser's own writes were cleaned up — nothing left under its prefix.
        expect(fakeS3.objects.size).toBe(0);
    });

    it('concurrent UPGRADE installs racing on (app_id, version): the loser does NOT touch S3 (the shared prefix belongs to the winner)', async () => {
        const sourceTar = await buildTar([
            { name: 'src/App.tsx', content: 'x' },
        ]);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
        ]);
        const fakeS3 = makeFakeS3();
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([
                {
                    app_id: 'existing-app-uuid',
                    registry_slug: 'sankey',
                    latest_ready_registry_version: '1.2.0',
                },
            ]),
            getLatestVersion: vi.fn().mockResolvedValue({ version: 2 }),
            createVersion: vi.fn().mockRejectedValue(databaseError('23505')),
        };
        const chartRegistryClient = {
            downloadArtifact: vi
                .fn()
                .mockImplementation(
                    (_entry: unknown, kind: 'source' | 'dist') =>
                        Promise.resolve(
                            kind === 'source' ? sourceTar : distTar,
                        ),
                ),
        };
        const svc = buildService({
            appModel,
            chartRegistryClient,
            s3ClientOverride: fakeS3,
        });

        await expect(
            svc.installRegistryChartType(fakeUser, PROJECT_UUID, 'sankey'),
        ).rejects.toThrow(
            'Another install of this chart type is in progress — retry',
        );

        const deleteCalls = fakeS3.send.mock.calls
            .map(([cmd]) => cmd as FakeCommand)
            .filter((cmd) => cmd.constructor.name === 'DeleteObjectsCommand');
        expect(deleteCalls).toHaveLength(0);
        // The winner's PutObject writes under the shared prefix are still intact.
        expect(fakeS3.objects.size).toBeGreaterThan(0);
    });

    it('requires create DataApp ability', async () => {
        const svc = buildService({});
        vi.spyOn(
            svc as unknown as {
                assertDataAppAbility: (...args: unknown[]) => Promise<unknown>;
            },
            'assertDataAppAbility',
        ).mockRejectedValue(new ForbiddenError('nope'));

        await expect(
            svc.installRegistryChartType(fakeUser, PROJECT_UUID, 'sankey'),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('AppGenerateService registry feature-flag gates', () => {
    it('listRegistryChartTypes throws ForbiddenError when EnableDataApps is disabled', async () => {
        const svc = buildService({
            featureFlags: { [FeatureFlags.EnableDataApps]: false },
        });

        await expect(
            svc.listRegistryChartTypes(fakeUser, PROJECT_UUID),
        ).rejects.toThrow(ForbiddenError);
    });

    it('listRegistryChartTypes throws ForbiddenError when ChartTypeRegistry is disabled', async () => {
        const svc = buildService({
            featureFlags: { [FeatureFlags.ChartTypeRegistry]: false },
        });

        await expect(
            svc.listRegistryChartTypes(fakeUser, PROJECT_UUID),
        ).rejects.toThrow(ForbiddenError);
    });

    it('installRegistryChartType throws ForbiddenError when EnableDataApps is disabled', async () => {
        const svc = buildService({
            featureFlags: { [FeatureFlags.EnableDataApps]: false },
        });

        await expect(
            svc.installRegistryChartType(fakeUser, PROJECT_UUID, 'sankey'),
        ).rejects.toThrow(ForbiddenError);
    });

    it('installRegistryChartType throws ForbiddenError when ChartTypeRegistry is disabled', async () => {
        const svc = buildService({
            featureFlags: { [FeatureFlags.ChartTypeRegistry]: false },
        });

        await expect(
            svc.installRegistryChartType(fakeUser, PROJECT_UUID, 'sankey'),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('AppGenerateService.getRegistryAsset', () => {
    it('returns undefined when the registry client is disabled, without calling getAsset', async () => {
        const getAsset = vi.fn();
        const svc = buildService({
            chartRegistryClient: { isEnabled: () => false, getAsset },
        });

        const result = await svc.getRegistryAsset(
            fakeUser,
            'sankey/1.3.0/thumb.png',
        );

        expect(result).toBeUndefined();
        expect(getAsset).not.toHaveBeenCalled();
    });

    it('delegates to chartRegistryClient.getAsset when enabled', async () => {
        const asset = {
            buffer: Buffer.from('fake-png'),
            contentType: 'image/png',
        };
        const getAsset = vi.fn().mockResolvedValue(asset);
        const svc = buildService({
            chartRegistryClient: { isEnabled: () => true, getAsset },
        });

        const result = await svc.getRegistryAsset(
            fakeUser,
            'sankey/1.3.0/thumb.png',
        );

        expect(getAsset).toHaveBeenCalledWith('sankey/1.3.0/thumb.png');
        expect(result).toBe(asset);
    });

    it('returns undefined when the underlying client returns undefined (path not in the index)', async () => {
        const getAsset = vi.fn().mockResolvedValue(undefined);
        const svc = buildService({
            chartRegistryClient: { isEnabled: () => true, getAsset },
        });

        const result = await svc.getRegistryAsset(fakeUser, 'unknown/path.png');

        expect(result).toBeUndefined();
    });

    it('throws ForbiddenError when EnableDataApps is disabled', async () => {
        const svc = buildService({
            featureFlags: { [FeatureFlags.EnableDataApps]: false },
        });

        await expect(
            svc.getRegistryAsset(fakeUser, 'sankey/1.3.0/thumb.png'),
        ).rejects.toThrow(ForbiddenError);
    });

    it('throws ForbiddenError when ChartTypeRegistry is disabled', async () => {
        const svc = buildService({
            featureFlags: { [FeatureFlags.ChartTypeRegistry]: false },
        });

        await expect(
            svc.getRegistryAsset(fakeUser, 'sankey/1.3.0/thumb.png'),
        ).rejects.toThrow(ForbiddenError);
    });
});
