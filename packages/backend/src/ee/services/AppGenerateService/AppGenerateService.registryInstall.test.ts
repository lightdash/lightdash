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
    type DataAppCodeFile,
    type DataAppManifest,
    type DataAppVizSchema,
    type ImportAppCodeRequestBody,
    type SessionUser,
} from '@lightdash/common';
import { DatabaseError } from 'pg';
import { pack } from 'tar-stream';
import { buildAppThumbnailClientMock } from '../../clients/AppThumbnailClient.mock';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
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
        icon: null,
        vizSchema: VIZ_SCHEMA,
        thumbnail: null,
        thumbnailDark: null,
        preview: { rows: [{ category: 'Demo', value: 42 }] },
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
    savedChartModel?: Record<string, unknown>;
    chartRegistryClient?: Record<string, unknown>;
    s3ClientOverride?: { client: never; bucket: string };
    ability?: { can: () => boolean; cannot: () => boolean };
    // Per-featureFlagId overrides; any flag not listed defaults to enabled.
    featureFlags?: Partial<Record<string, boolean>>;
}): AppGenerateService {
    const {
        appModel = {},
        projectModel = {},
        savedChartModel = {},
        chartRegistryClient = {},
        s3ClientOverride,
        ability = { can: () => true, cannot: () => false },
        featureFlags = {},
    } = overrides;

    const fullAppModel = {
        listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
        findNewestDeletedRegistryApp: vi.fn().mockResolvedValue(undefined),
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
        readsNextChannelIndex: () => false,
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
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
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
        savedChartModel: savedChartModel as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: spacePermissionService as never,
        coderService: {} as never,
        documentService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        chartRegistryClient: fullChartRegistryClient as never,
        contentVerificationModel: {
            getByContent: async () => null,
            verify: async () => undefined,
            unverify: async () => undefined,
        } as never,
        sandboxManager: null,
        appRuntimeS3: null,
        appThumbnailClient: buildAppThumbnailClientMock(),
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

    it('derives releaseStage from the channel tag and the index the instance reads', async () => {
        const entries = [
            makeEntry({ slug: 'untagged' }),
            makeEntry({ slug: 'beta-chart', channel: 'beta' }),
        ];
        const stages = async (readsNext: boolean) => {
            const svc = buildService({
                chartRegistryClient: {
                    getIndex: vi.fn().mockResolvedValue(makeIndex(entries)),
                    readsNextChannelIndex: () => readsNext,
                },
            });
            const result = await svc.listRegistryChartTypes(
                fakeUser,
                PROJECT_UUID,
            );
            return Object.fromEntries(
                result.charts.map((c) => [c.slug, c.releaseStage]),
            );
        };

        // Stable index omits the channel field for stable entries.
        expect(await stages(false)).toEqual({
            untagged: 'stable',
            'beta-chart': 'beta',
        });
        // On index-next an untagged entry is unpointed, i.e. pre-release.
        expect(await stages(true)).toEqual({
            untagged: 'prerelease',
            'beta-chart': 'beta',
        });
    });

    it('shows no update badge when the index entry is older than the install (registry downgrade)', async () => {
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([
                {
                    app_id: 'app-uuid-sankey',
                    registry_slug: 'sankey',
                    latest_ready_registry_version: '2.0.0',
                    created_by_user_uuid: 'installer-user-uuid',
                },
            ]),
        };
        const svc = buildService({ appModel });

        const result = await svc.listRegistryChartTypes(fakeUser, PROJECT_UUID);

        const sankey = result.charts.find((c) => c.slug === 'sankey');
        expect(sankey?.state).toBe('installed');
        expect(sankey?.installedRegistryVersion).toBe('2.0.0');
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
        expect(optsArg).toEqual({
            registryVersion: '1.3.0',
            thread: { origin: 'import', aiThreadUuid: null },
            vizPreview: SANKEY_ENTRY.preview,
        });
    });

    it('fresh install: passes the registry entry icon onto the created app', async () => {
        const iconEntry = makeEntry({ icon: 'chart-sankey' });
        const sourceTar = await buildTar([
            { name: 'src/App.tsx', content: 'x' },
        ]);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
        ]);
        const fakeS3 = makeFakeS3();
        const createWithVersion = vi.fn().mockResolvedValue(undefined);
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
            createWithVersion,
        };
        const chartRegistryClient = {
            getEntry: vi.fn().mockResolvedValue(iconEntry),
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

        await svc.installRegistryChartType(fakeUser, PROJECT_UUID, 'sankey');

        const [appArg] = createWithVersion.mock.calls[0];
        expect(appArg).toEqual(
            expect.objectContaining({ icon: 'chart-sankey' }),
        );
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
            upgradedChartCount: 0,
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
        const updateApp = vi.fn().mockResolvedValue(undefined);
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
            updateApp,
        };
        const iconEntry = makeEntry({ icon: 'chart-radar' });
        const chartRegistryClient = {
            getEntry: vi.fn().mockResolvedValue(iconEntry),
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
            upgradedChartCount: 0,
        });
        expect(createVersion).toHaveBeenCalledWith(
            'existing-app-uuid',
            { version: 3, prompt: expect.any(String) },
            'ready',
            fakeUser.userUuid,
            undefined,
            undefined,
            PARSED_VIZ_SCHEMA,
            { registryVersion: '1.3.0', vizPreview: SANKEY_ENTRY.preview },
        );
        // The registry's icon always wins on upgrade — installed types are
        // read-only, so it can't have drifted locally.
        expect(updateApp).toHaveBeenCalledWith(
            'existing-app-uuid',
            PROJECT_UUID,
            { icon: 'chart-radar' },
        );
    });

    it('appends the older registry version when the index was downgraded (rollback)', async () => {
        const sourceTar = await buildTar([
            { name: 'src/App.tsx', content: 'x' },
        ]);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
        ]);
        const createVersion = vi.fn().mockResolvedValue({ version: 4 });
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([
                {
                    app_id: 'existing-app-uuid',
                    registry_slug: 'sankey',
                    latest_ready_registry_version: '2.0.0',
                },
            ]),
            getLatestVersion: vi.fn().mockResolvedValue({ version: 3 }),
            createVersion,
            updateApp: vi.fn().mockResolvedValue(undefined),
        };
        const chartRegistryClient = {
            getEntry: vi.fn().mockResolvedValue(makeEntry()),
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
            s3ClientOverride: makeFakeS3(),
        });

        const result = await svc.installRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            'sankey',
        );

        // Appending the pointed (older) version IS the customer-facing
        // rollback: unpinned charts follow it, pinned charts are unaffected.
        expect(result).toEqual({
            appUuid: 'existing-app-uuid',
            slug: 'sankey',
            version: 4,
            action: 'upgraded',
            upgradedChartCount: 0,
        });
        expect(createVersion).toHaveBeenCalledWith(
            'existing-app-uuid',
            { version: 4, prompt: expect.any(String) },
            'ready',
            fakeUser.userUuid,
            undefined,
            undefined,
            PARSED_VIZ_SCHEMA,
            { registryVersion: '1.3.0', vizPreview: SANKEY_ENTRY.preview },
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

describe('reinstall revives a soft-deleted install', () => {
    it('revives at the current registry version without downloading', async () => {
        const restore = vi.fn().mockResolvedValue(undefined);
        const updateApp = vi.fn().mockResolvedValue(undefined);
        const downloadArtifact = vi.fn();
        const svc = buildService({
            appModel: {
                listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
                findNewestDeletedRegistryApp: vi.fn().mockResolvedValue({
                    app_id: 'revived-app-uuid',
                    registry_slug: 'sankey',
                    latest_ready_registry_version: SANKEY_ENTRY.version,
                    created_by_user_uuid: 'someone-else',
                }),
                restore,
                updateApp,
                getLatestReadyVersion: vi.fn().mockResolvedValue({
                    version: 3,
                }),
            },
            chartRegistryClient: { downloadArtifact },
        });

        const result = await svc.installRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            'sankey',
        );

        expect(restore).toHaveBeenCalledWith('revived-app-uuid', PROJECT_UUID);
        expect(result).toEqual({
            appUuid: 'revived-app-uuid',
            slug: 'sankey',
            version: 3,
            action: 'installed',
            upgradedChartCount: 0,
        });
        expect(downloadArtifact).not.toHaveBeenCalled();
        expect(updateApp).toHaveBeenCalledWith(
            'revived-app-uuid',
            PROJECT_UUID,
            { icon: SANKEY_ENTRY.icon },
        );
    });

    it('revives an older install and appends the registry version', async () => {
        const sourceTar = await buildTar([
            { name: 'src/App.tsx', content: 'x' },
        ]);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
        ]);
        const restore = vi.fn().mockResolvedValue(undefined);
        const createVersion = vi.fn().mockResolvedValue(undefined);
        const createWithVersion = vi.fn();
        const svc = buildService({
            appModel: {
                listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
                findNewestDeletedRegistryApp: vi.fn().mockResolvedValue({
                    app_id: 'revived-app-uuid',
                    registry_slug: 'sankey',
                    latest_ready_registry_version: '1.0.0',
                    created_by_user_uuid: null,
                }),
                restore,
                createVersion,
                createWithVersion,
                updateApp: vi.fn().mockResolvedValue(undefined),
                getLatestVersion: vi.fn().mockResolvedValue({ version: 4 }),
            },
            chartRegistryClient: {
                downloadArtifact: vi
                    .fn()
                    .mockImplementation(
                        (_entry: unknown, kind: 'source' | 'dist') =>
                            Promise.resolve(
                                kind === 'source' ? sourceTar : distTar,
                            ),
                    ),
            },
            s3ClientOverride: makeFakeS3(),
        });

        const result = await svc.installRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            'sankey',
        );

        expect(restore).toHaveBeenCalledWith('revived-app-uuid', PROJECT_UUID);
        expect(createWithVersion).not.toHaveBeenCalled();
        expect(createVersion).toHaveBeenCalled();
        expect(result).toMatchObject({
            appUuid: 'revived-app-uuid',
            version: 5,
            action: 'installed',
        });
    });

    it('maps a restore race on the slug to a retryable error', async () => {
        const svc = buildService({
            appModel: {
                listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
                findNewestDeletedRegistryApp: vi.fn().mockResolvedValue({
                    app_id: 'revived-app-uuid',
                    registry_slug: 'sankey',
                    latest_ready_registry_version: SANKEY_ENTRY.version,
                    created_by_user_uuid: null,
                }),
                restore: vi.fn().mockRejectedValue(databaseError('23505')),
            },
        });

        await expect(
            svc.installRegistryChartType(fakeUser, PROJECT_UUID, 'sankey'),
        ).rejects.toThrow(
            'This chart type was just installed by someone else — refresh',
        );
    });
});

describe('upgradeConsumingCharts sweep', () => {
    const upgradeAppModel = () => ({
        listRegistryInstalledApps: vi.fn().mockResolvedValue([
            {
                app_id: 'existing-app-uuid',
                registry_slug: 'sankey',
                latest_ready_registry_version: '1.2.0',
            },
        ]),
        getLatestVersion: vi.fn().mockResolvedValue({ version: 2 }),
        createVersion: vi.fn().mockResolvedValue({ version: 3 }),
        updateApp: vi.fn().mockResolvedValue(undefined),
    });
    const upgradeRegistryClient = async () => {
        const sourceTar = await buildTar([
            { name: 'src/App.tsx', content: 'x' },
        ]);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
        ]);
        return {
            getEntry: vi.fn().mockResolvedValue(makeEntry()),
            downloadArtifact: vi
                .fn()
                .mockImplementation(
                    (_entry: unknown, kind: 'source' | 'dist') =>
                        Promise.resolve(
                            kind === 'source' ? sourceTar : distTar,
                        ),
                ),
        };
    };

    it('repins consumers onto the appended version and reports the count', async () => {
        const repinChartsUsingDataAppViz = vi.fn().mockResolvedValue(5);
        const svc = buildService({
            appModel: upgradeAppModel(),
            savedChartModel: { repinChartsUsingDataAppViz },
            chartRegistryClient: await upgradeRegistryClient(),
            s3ClientOverride: makeFakeS3(),
        });

        const result = await svc.installRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            'sankey',
            { upgradeConsumingCharts: true },
        );

        expect(repinChartsUsingDataAppViz).toHaveBeenCalledWith(
            PROJECT_UUID,
            'existing-app-uuid',
            3,
        );
        expect(result).toMatchObject({
            action: 'upgraded',
            version: 3,
            upgradedChartCount: 5,
        });
        expect(analyticsTrackSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'data_app.registry_installed',
                properties: expect.objectContaining({
                    action: 'upgraded',
                    upgradedChartCount: 5,
                }),
            }),
        );
    });

    it('never sweeps without the flag', async () => {
        const repinChartsUsingDataAppViz = vi.fn();
        const svc = buildService({
            appModel: upgradeAppModel(),
            savedChartModel: { repinChartsUsingDataAppViz },
            chartRegistryClient: await upgradeRegistryClient(),
            s3ClientOverride: makeFakeS3(),
        });

        const result = await svc.installRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            'sankey',
        );

        expect(repinChartsUsingDataAppViz).not.toHaveBeenCalled();
        expect(result.upgradedChartCount).toBe(0);
    });

    it('still sweeps when already at the latest version (concurrent upgrade recovery)', async () => {
        const repinChartsUsingDataAppViz = vi.fn().mockResolvedValue(2);
        const svc = buildService({
            appModel: {
                listRegistryInstalledApps: vi.fn().mockResolvedValue([
                    {
                        app_id: 'existing-app-uuid',
                        registry_slug: 'sankey',
                        latest_ready_registry_version: '1.3.0',
                    },
                ]),
                getLatestReadyVersion: vi
                    .fn()
                    .mockResolvedValue({ version: 4 }),
            },
            savedChartModel: { repinChartsUsingDataAppViz },
        });

        const result = await svc.installRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            'sankey',
            { upgradeConsumingCharts: true },
        );

        expect(repinChartsUsingDataAppViz).toHaveBeenCalledWith(
            PROJECT_UUID,
            'existing-app-uuid',
            4,
        );
        expect(result).toMatchObject({
            action: 'unchanged',
            upgradedChartCount: 2,
        });
    });
});

describe('AppGenerateService registry feature-flag gates', () => {
    // The library follows the ChartTypeRegistry flag alone: a customer
    // without data apps can still browse and install chart types.
    it('listRegistryChartTypes works with EnableDataApps disabled', async () => {
        const svc = buildService({
            featureFlags: { [FeatureFlags.EnableDataApps]: false },
        });

        const result = await svc.listRegistryChartTypes(fakeUser, PROJECT_UUID);

        expect(result.registryEnabled).toBe(true);
    });

    it('listRegistryChartTypes throws ForbiddenError when ChartTypeRegistry is disabled', async () => {
        const svc = buildService({
            featureFlags: { [FeatureFlags.ChartTypeRegistry]: false },
        });

        await expect(
            svc.listRegistryChartTypes(fakeUser, PROJECT_UUID),
        ).rejects.toThrow(ForbiddenError);
    });

    it('installRegistryChartType works with EnableDataApps disabled', async () => {
        const sourceTar = await buildTar([
            { name: 'src/App.tsx', content: 'x' },
        ]);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
        ]);
        const svc = buildService({
            featureFlags: { [FeatureFlags.EnableDataApps]: false },
            appModel: {
                listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
                createWithVersion: vi.fn().mockResolvedValue(undefined),
            },
            chartRegistryClient: {
                downloadArtifact: vi
                    .fn()
                    .mockImplementation(
                        (_entry: unknown, kind: 'source' | 'dist') =>
                            Promise.resolve(
                                kind === 'source' ? sourceTar : distTar,
                            ),
                    ),
            },
            s3ClientOverride: makeFakeS3(),
        });

        const result = await svc.installRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            'sankey',
        );

        expect(result.action).toBe('installed');
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

    it('serves assets with EnableDataApps disabled', async () => {
        const asset = {
            buffer: Buffer.from('fake-png'),
            contentType: 'image/png',
        };
        const getAsset = vi.fn().mockResolvedValue(asset);
        const svc = buildService({
            featureFlags: { [FeatureFlags.EnableDataApps]: false },
            chartRegistryClient: { isEnabled: () => true, getAsset },
        });

        await expect(
            svc.getRegistryAsset(fakeUser, 'sankey/1.3.0/thumb.png'),
        ).resolves.toBe(asset);
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

describe('importAppCode with registry provenance', () => {
    const SRC = [
        { name: 'src/App.tsx', content: 'export default function App(){}' },
    ];
    const toUploadFiles = (
        entries: { name: string; content: string }[],
    ): DataAppCodeFile[] =>
        entries.map((e) => ({
            path: e.name,
            contentBase64: Buffer.from(e.content).toString('base64'),
        }));
    const PROVENANCE: NonNullable<DataAppManifest['registry']> = {
        slug: 'sankey',
        version: '1.1.0',
        url: REGISTRY_BASE_URL,
    };
    const makeBody = (
        files: DataAppCodeFile[],
        registry: DataAppManifest['registry'] = PROVENANCE,
    ): ImportAppCodeRequestBody => ({
        code: {
            manifest: {
                codeVersion: 1,
                slug: 'sankey',
                version: 1,
                name: SANKEY_ENTRY.name,
                description: SANKEY_ENTRY.description,
                template: DATA_APP_VIZ_TEMPLATE,
                vizSchema: SANKEY_ENTRY.vizSchema,
                downloadedAt: new Date().toISOString(),
                ...(registry ? { registry } : {}),
            },
            files,
        },
    });
    const pinnedEntry = makeEntry({ version: '1.1.0' });

    async function setup(
        overrides: {
            registryTarEntries?: { name: string; content: string }[];
            appModel?: Record<string, unknown>;
            featureFlags?: Partial<Record<string, boolean>>;
            versionEntry?: ChartRegistryEntry | undefined;
            baseUrl?: string;
        } = {},
    ) {
        const sourceTar = await buildTar(overrides.registryTarEntries ?? SRC);
        const distTar = await buildTar([
            { name: 'dist/index.html', content: '<html></html>' },
        ]);
        const fakeS3 = makeFakeS3();
        const createWithVersion = vi.fn().mockResolvedValue(undefined);
        const appModel = {
            listRegistryInstalledApps: vi.fn().mockResolvedValue([]),
            findAppBySlug: vi.fn().mockResolvedValue(undefined),
            createWithVersion,
            ...overrides.appModel,
        };
        const chartRegistryClient = {
            getBaseUrl: () => overrides.baseUrl ?? REGISTRY_BASE_URL,
            getVersionEntry: vi
                .fn()
                .mockResolvedValue(
                    'versionEntry' in overrides
                        ? overrides.versionEntry
                        : pinnedEntry,
                ),
            downloadArtifact: vi
                .fn()
                .mockImplementation((_e: unknown, kind: 'source' | 'dist') =>
                    Promise.resolve(kind === 'source' ? sourceTar : distTar),
                ),
        };
        const svc = buildService({
            appModel,
            chartRegistryClient,
            s3ClientOverride: fakeS3,
            featureFlags: overrides.featureFlags,
        });
        return {
            svc,
            appModel,
            chartRegistryClient,
            fakeS3,
            createWithVersion,
        };
    }

    const callHelper = (
        svc: AppGenerateService,
        files: DataAppCodeFile[],
        manifestSlug: string | undefined = 'sankey',
    ) =>
        (
            svc as unknown as {
                tryImportRegistryChartType: (
                    ...args: unknown[]
                ) => Promise<{ kind: string; warning?: string }>;
            }
        ).tryImportRegistryChartType(
            fakeUser,
            PROJECT_UUID,
            PROVENANCE,
            manifestSlug,
            files,
            {},
        );

    beforeEach(() => {
        analyticsTrackSpy.mockClear();
    });

    it('matching source → installs the pinned registry version with no build and with data apps disabled', async () => {
        const { svc, createWithVersion, chartRegistryClient } = await setup({
            featureFlags: { [FeatureFlags.EnableDataApps]: false },
        });
        const result = await svc.importAppCode(
            fakeUser,
            PROJECT_UUID,
            makeBody(toUploadFiles(SRC)),
        );
        expect(result).toEqual(
            expect.objectContaining({
                action: 'create',
                slug: 'sankey',
                version: 1,
                warnings: [],
            }),
        );
        expect(chartRegistryClient.getVersionEntry).toHaveBeenCalledWith(
            'sankey',
            '1.1.0',
        );
        // source.tar is reused from the comparison; only dist is fetched again.
        expect(chartRegistryClient.downloadArtifact).toHaveBeenCalledTimes(2);
        const [appArg, , statusArg, , , , optsArg] =
            createWithVersion.mock.calls[0];
        expect(appArg).toEqual(
            expect.objectContaining({ registry_slug: 'sankey' }),
        );
        expect(statusArg).toBe('ready');
        expect(optsArg).toEqual(
            expect.objectContaining({ registryVersion: '1.1.0' }),
        );
        expect(analyticsTrackSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'data_app.uploaded',
                properties: expect.objectContaining({
                    registrySlug: 'sankey',
                    registryVersion: '1.1.0',
                    hasCustomDependencies: false,
                }),
            }),
        );
    });

    it('already installed at that version → unchanged', async () => {
        const { svc, createWithVersion } = await setup({
            appModel: {
                findAppBySlug: vi.fn().mockResolvedValue({
                    app_id: 'existing-app',
                    slug: 'sankey',
                    registry_slug: 'sankey',
                }),
                listRegistryInstalledApps: vi.fn().mockResolvedValue([
                    {
                        app_id: 'existing-app',
                        registry_slug: 'sankey',
                        latest_ready_registry_version: '1.1.0',
                    },
                ]),
                getLatestReadyVersion: vi
                    .fn()
                    .mockResolvedValue({ version: 3 }),
            },
        });
        const result = await svc.importAppCode(
            fakeUser,
            PROJECT_UUID,
            makeBody(toUploadFiles(SRC)),
        );
        expect(result.action).toBe('unchanged');
        expect(result.version).toBe(3);
        expect(createWithVersion).not.toHaveBeenCalled();
    });

    it('ignores non-src entries in the registry source.tar when comparing', async () => {
        const { svc } = await setup({
            registryTarEntries: [...SRC, { name: '.DS_Store', content: 'x' }],
        });
        const result = await svc.importAppCode(
            fakeUser,
            PROJECT_UUID,
            makeBody(toUploadFiles(SRC)),
        );
        expect(result.action).toBe('create');
    });

    it('treats a trailing-slash difference in the registry url as the same registry', async () => {
        const { svc } = await setup();
        const result = await svc.importAppCode(
            fakeUser,
            PROJECT_UUID,
            makeBody(toUploadFiles(SRC), {
                ...PROVENANCE,
                url: `${REGISTRY_BASE_URL}/`,
            }),
        );
        expect(result.action).toBe('create');
    });

    it('modified source → falls through to the normal upload path with a warning', async () => {
        const { svc } = await setup({
            featureFlags: { [FeatureFlags.EnableDataApps]: false },
        });
        const changed = toUploadFiles([
            { name: 'src/App.tsx', content: 'changed' },
        ]);
        // The normal path's first gate is EnableDataApps; hitting it proves
        // the fallthrough happened without exercising the whole build chain.
        await expect(
            svc.importAppCode(fakeUser, PROJECT_UUID, makeBody(changed)),
        ).rejects.toThrow('Data apps are not enabled');
        const outcome = await callHelper(svc, changed);
        expect(outcome.kind).toBe('fallthrough');
        expect(outcome.warning).toMatch(/differs from "sankey@1\.1\.0"/);
    });

    it('a custom app already holding the slug → falls through with a warning', async () => {
        const { svc } = await setup({
            appModel: {
                findAppBySlug: vi.fn().mockResolvedValue({
                    app_id: 'custom-app',
                    slug: 'sankey',
                    registry_slug: null,
                }),
            },
        });
        const outcome = await callHelper(svc, toUploadFiles(SRC));
        expect(outcome.kind).toBe('fallthrough');
        expect(outcome.warning).toMatch(/already exists/);
    });

    it('rejects when the chart type library is disabled', async () => {
        const { svc } = await setup({
            featureFlags: { [FeatureFlags.ChartTypeRegistry]: false },
        });
        await expect(
            svc.importAppCode(
                fakeUser,
                PROJECT_UUID,
                makeBody(toUploadFiles(SRC)),
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('rejects a bundle from a different registry', async () => {
        const { svc } = await setup();
        await expect(
            svc.importAppCode(
                fakeUser,
                PROJECT_UUID,
                makeBody(toUploadFiles(SRC), {
                    ...PROVENANCE,
                    url: 'https://other.example.com',
                }),
            ),
        ).rejects.toThrow(/different chart registry/);
    });

    it('rejects an unknown registry version and an incompatible one', async () => {
        const missing = await setup({ versionEntry: undefined });
        await expect(
            missing.svc.importAppCode(
                fakeUser,
                PROJECT_UUID,
                makeBody(toUploadFiles(SRC)),
            ),
        ).rejects.toThrow(/not found in the chart type library/);
        const incompatible = await setup({
            versionEntry: makeEntry({
                version: '1.1.0',
                minLightdashVersion: '999.0.0',
            }),
        });
        await expect(
            incompatible.svc.importAppCode(
                fakeUser,
                PROJECT_UUID,
                makeBody(toUploadFiles(SRC)),
            ),
        ).rejects.toThrow(/requires a newer version/);
    });

    it('wraps a registry outage in a chart type library error', async () => {
        const { svc, chartRegistryClient } = await setup();
        chartRegistryClient.getVersionEntry.mockRejectedValue(
            new Error('ECONNREFUSED'),
        );
        await expect(
            svc.importAppCode(
                fakeUser,
                PROJECT_UUID,
                makeBody(toUploadFiles(SRC)),
            ),
        ).rejects.toThrow(/Could not reach the chart type library/);
    });

    it('rejects a malformed registry block', async () => {
        const { svc } = await setup();
        await expect(
            svc.importAppCode(
                fakeUser,
                PROJECT_UUID,
                makeBody(toUploadFiles(SRC), {
                    ...PROVENANCE,
                    slug: '../etc',
                }),
            ),
        ).rejects.toThrow(/Invalid registry block/);
    });

    it('rejects a null registry block (emptied in lightdash-app.yml) with a clear error', async () => {
        const { svc } = await setup();
        const body = makeBody(toUploadFiles(SRC));
        (body.code.manifest as Record<string, unknown>).registry = null;
        await expect(
            svc.importAppCode(fakeUser, PROJECT_UUID, body),
        ).rejects.toThrow(/Invalid registry block/);
    });

    it('wraps a registry outage during the source or dist download in a chart type library error', async () => {
        const sourceDown = await setup();
        sourceDown.chartRegistryClient.downloadArtifact.mockRejectedValue(
            new Error('ECONNRESET'),
        );
        await expect(
            sourceDown.svc.importAppCode(
                fakeUser,
                PROJECT_UUID,
                makeBody(toUploadFiles(SRC)),
            ),
        ).rejects.toThrow(/Could not reach the chart type library/);

        const distDown = await setup();
        const sourceTar = await buildTar(SRC);
        distDown.chartRegistryClient.downloadArtifact.mockImplementation(
            (_e: unknown, kind: 'source' | 'dist') =>
                kind === 'source'
                    ? Promise.resolve(sourceTar)
                    : Promise.reject(new Error('ECONNRESET')),
        );
        await expect(
            distDown.svc.importAppCode(
                fakeUser,
                PROJECT_UUID,
                makeBody(toUploadFiles(SRC)),
            ),
        ).rejects.toThrow(/Could not reach the chart type library/);
    });

    it('a manifest slug that differs from the library slug → falls through so the copy forks under the new slug', async () => {
        const { svc } = await setup();
        const outcome = await callHelper(svc, toUploadFiles(SRC), 'my-trellis');
        expect(outcome.kind).toBe('fallthrough');
        expect(outcome.warning).toMatch(/slug "my-trellis" differs/);
    });
});
