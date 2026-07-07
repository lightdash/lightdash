// Stub the e2b/ai SDKs before importing AppGenerateService so the tests never
// reach the real sandbox or model client.
import {
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { pack } from 'tar-stream';
import { assertCanViewApp } from './appAuthz';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

// Mock appAuthz so permission checks are controllable in tests
vi.mock('./appAuthz', () => ({
    assertCanViewApp: vi.fn().mockResolvedValue(undefined),
}));

// ── helpers ──────────────────────────────────────────────────────────────────

const APP_UUID = 'app-uuid-1234';
const PROJECT_UUID = 'project-uuid-5678';
const ORG_UUID = 'org-uuid-abcd';
const VERSION = 3;

const SOURCE_FILES = [
    { name: 'src/App.jsx', content: 'export default function App() {}' },
    { name: 'src/lib/theme.ts', content: 'export const theme = {};' },
];

/** Build a real tar buffer containing SOURCE_FILES using tar-stream pack(). */
async function buildSourceTar(): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const p = pack();
        const chunks: Buffer[] = [];
        p.on('data', (c: Buffer) => chunks.push(c));
        p.on('end', () => resolve(Buffer.concat(chunks)));
        p.on('error', reject);

        const addEntries = (
            files: typeof SOURCE_FILES,
            index: number,
        ): void => {
            if (index >= files.length) {
                p.finalize();
                return;
            }
            const file = files[index];
            p.entry({ name: file.name }, file.content, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                addEntries(files, index + 1);
            });
        };
        addEntries(SOURCE_FILES, 0);
    });
}

const fakeApp = {
    app_id: APP_UUID,
    project_uuid: PROJECT_UUID,
    organization_uuid: ORG_UUID,
    space_uuid: null,
    created_by_user_uuid: 'user-uuid',
    name: 'My App',
    description: 'A test app',
    template: null,
    design_uuid: null,
};

const fakeAppVersion = {
    app_version_id: 'version-id',
    app_id: APP_UUID,
    version: VERSION,
    status: 'ready' as const,
    prompt: '',
    error: null,
};

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

type FakeCommand = {
    constructor: { name: string };
    input: Record<string, unknown>;
};

/** Build a fake S3 client that returns a tar body for the source.tar key. */
function makeFakeS3(tarBuffer: Buffer, expectedVersion: number = VERSION) {
    const sourceTarKey = `apps/${APP_UUID}/versions/${expectedVersion}/source.tar`;

    const send = vi.fn(async (command: FakeCommand) => {
        const cmdName = command.constructor.name;

        if (cmdName === 'GetObjectCommand') {
            const key = command.input.Key as string;
            if (key === sourceTarKey) {
                const { Readable } = await import('node:stream');
                return { Body: Readable.from([tarBuffer]) };
            }
            const err = Object.assign(new Error('NoSuchKey'), {
                name: 'NoSuchKey',
                Code: 'NoSuchKey',
            });
            throw err;
        }

        throw new Error(`Unexpected command: ${cmdName}`);
    });

    return {
        client: { send } as never,
        bucket: 'test-bucket',
        send,
    };
}

// ── service factory ───────────────────────────────────────────────────────────

function buildService(overrides: {
    appModel?: Record<string, unknown>;
    s3ClientOverride?: { client: never; bucket: string };
    projectModel?: Record<string, unknown>;
    projectParametersModel?: Record<string, unknown>;
    organizationDesignModel?: Record<string, unknown>;
}): AppGenerateService {
    const {
        appModel = {},
        s3ClientOverride,
        projectModel = {},
        projectParametersModel = {},
        organizationDesignModel = {},
    } = overrides;

    // Default mocks for context-assembly methods so existing tests don't break
    const fullAppModel = {
        getAppWithVersions: vi
            .fn()
            .mockResolvedValue({ versions: [], hasMore: false }),
        ...appModel,
    };

    const fullProjectModel = {
        getAllExploresFromCache: vi.fn().mockResolvedValue({}),
        ...projectModel,
    };

    const fullProjectParametersModel = {
        find: vi.fn().mockResolvedValue([]),
        ...projectParametersModel,
    };

    const fullOrganizationDesignModel = {
        findInOrganization: vi.fn().mockResolvedValue(null),
        ...organizationDesignModel,
    };

    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const spacePermissionService = {
        getSpaceAccessContext: vi.fn().mockResolvedValue({}),
    };

    const svc = new AppGenerateService({
        lightdashConfig: {} as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: fullAppModel as never,
        featureFlagModel: featureFlagModel as never,
        organizationDesignModel: fullOrganizationDesignModel as never,
        pinnedListModel: {} as never,
        projectModel: fullProjectModel as never,
        projectParametersModel: fullProjectParametersModel as never,
        spaceModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: spacePermissionService as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
    });

    if (s3ClientOverride) {
        vi.spyOn(
            svc as unknown as { getS3Client: () => unknown },
            'getS3Client',
        ).mockReturnValue(s3ClientOverride);
    }

    return svc;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AppGenerateService.getAppCode', () => {
    let sourceTarBuffer: Buffer;

    beforeAll(async () => {
        sourceTarBuffer = await buildSourceTar();
    });

    beforeEach(() => {
        vi.mocked(assertCanViewApp).mockResolvedValue(undefined);
    });

    it('returns a DataAppCode with manifest and extracted source files for the latest ready version', async () => {
        const fakeS3 = makeFakeS3(sourceTarBuffer);
        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
            getLatestReadyVersion: vi.fn().mockResolvedValue(fakeAppVersion),
        };

        const svc = buildService({ appModel, s3ClientOverride: fakeS3 });

        const result = await svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID);

        // manifest fields
        expect(result.manifest.appUuid).toBe(APP_UUID);
        expect(result.manifest.projectUuid).toBe(PROJECT_UUID);
        expect(result.manifest.version).toBe(VERSION);
        expect(result.manifest.name).toBe('My App');
        expect(result.manifest.description).toBe('A test app');
        expect(result.manifest.template).toBeNull();
        expect(typeof result.manifest.downloadedAt).toBe('string');
        expect(result.manifest.codeVersion).toBe(1);

        // files — exactly the two source entries
        expect(result.files).toHaveLength(2);

        const appFile = result.files.find((f) => f.path === 'src/App.jsx');
        expect(appFile).toBeDefined();
        expect(Buffer.from(appFile!.contentBase64, 'base64').toString()).toBe(
            'export default function App() {}',
        );

        const themeFile = result.files.find(
            (f) => f.path === 'src/lib/theme.ts',
        );
        expect(themeFile).toBeDefined();
        expect(Buffer.from(themeFile!.contentBase64, 'base64').toString()).toBe(
            'export const theme = {};',
        );
    });

    it('uses the provided version number instead of latest ready', async () => {
        const EXPLICIT_VERSION = 7;
        const fakeS3 = makeFakeS3(sourceTarBuffer, EXPLICIT_VERSION);

        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
            getLatestReadyVersion: vi.fn(),
        };

        const svc = buildService({ appModel, s3ClientOverride: fakeS3 });
        const result = await svc.getAppCode(
            fakeUser,
            PROJECT_UUID,
            APP_UUID,
            EXPLICIT_VERSION,
        );

        expect(result.manifest.version).toBe(EXPLICIT_VERSION);
        expect(appModel.getLatestReadyVersion).not.toHaveBeenCalled();
        expect(result.files).toHaveLength(2);
    });

    it('throws NotFoundError when no ready version exists and version is omitted', async () => {
        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
            getLatestReadyVersion: vi.fn().mockResolvedValue(null),
        };

        const svc = buildService({
            appModel,
            s3ClientOverride: { client: {} as never, bucket: 'b' },
        });

        await expect(
            svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID),
        ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the source.tar object does not exist in S3', async () => {
        const send = vi.fn(async (_command: FakeCommand) => {
            const err = Object.assign(new Error('NoSuchKey'), {
                name: 'NoSuchKey',
                Code: 'NoSuchKey',
            });
            throw err;
        });
        const fakeS3 = { client: { send } as never, bucket: 'test-bucket' };

        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
            getLatestReadyVersion: vi.fn().mockResolvedValue(fakeAppVersion),
        };

        const svc = buildService({ appModel, s3ClientOverride: fakeS3 });

        await expect(
            svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID),
        ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the user cannot view the app', async () => {
        vi.mocked(assertCanViewApp).mockRejectedValue(
            new ForbiddenError(
                'Insufficient permissions to access this data app',
            ),
        );

        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
        };

        const svc = buildService({
            appModel,
            s3ClientOverride: { client: {} as never, bucket: 'b' },
        });

        await expect(
            svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID),
        ).rejects.toThrow(ForbiddenError);
    });

    it('resolves with manifest and files intact when semanticLayer fetch fails (degraded context)', async () => {
        const fakeS3 = makeFakeS3(sourceTarBuffer);

        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
            getLatestReadyVersion: vi.fn().mockResolvedValue(fakeAppVersion),
            getAppWithVersions: vi
                .fn()
                .mockResolvedValue({ versions: [], hasMore: false }),
        };

        const svc = buildService({
            appModel,
            s3ClientOverride: fakeS3,
            projectModel: {
                getAllExploresFromCache: vi
                    .fn()
                    .mockRejectedValue(new Error('cache miss')),
            },
            projectParametersModel: {
                find: vi.fn().mockResolvedValue([]),
            },
            organizationDesignModel: {
                findInOrganization: vi.fn().mockResolvedValue(null),
            },
        });

        // Should not throw even though semanticLayer fetch fails
        const result = await svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID);

        // Core deliverables are intact
        expect(result.manifest.appUuid).toBe(APP_UUID);
        expect(result.manifest.version).toBe(VERSION);
        expect(result.files).toHaveLength(2);

        // Semantic layer is degraded placeholder, not absent
        expect(result.context.semanticLayer).toBeDefined();
        expect(result.context.semanticLayer.path).toBe(
            '.lightdash/context/semantic-layer.yml',
        );
        const semanticContent = Buffer.from(
            result.context.semanticLayer.contentBase64,
            'base64',
        ).toString('utf8');
        expect(semanticContent).toContain('# Semantic layer unavailable');
    });

    it('passes limit: 100 to getAppWithVersions when assembling prompt history', async () => {
        const fakeS3 = makeFakeS3(sourceTarBuffer);

        const getAppWithVersionsSpy = vi
            .fn()
            .mockResolvedValue({ versions: [], hasMore: false });

        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
            getLatestReadyVersion: vi.fn().mockResolvedValue(fakeAppVersion),
            getAppWithVersions: getAppWithVersionsSpy,
        };

        const svc = buildService({ appModel, s3ClientOverride: fakeS3 });
        await svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID);

        expect(getAppWithVersionsSpy).toHaveBeenCalledWith(
            APP_UUID,
            PROJECT_UUID,
            { limit: 100 },
        );
    });

    it('assembles context: semantic layer, null parameters (empty), prompt history, and empty theme', async () => {
        const fakeS3 = makeFakeS3(sourceTarBuffer);

        const versions = [
            {
                app_version_id: 'v1-id',
                app_id: APP_UUID,
                version: 1,
                prompt: 'Build a sales dashboard',
                status: 'ready' as const,
                error: null,
                status_message: null,
                status_updated_at: null,
                resources: null,
                viz_schema: null,
                created_at: new Date('2024-01-01T10:00:00Z'),
                created_by_user_uuid: 'user-uuid',
                created_by_user_first_name: 'Test',
                created_by_user_last_name: 'User',
            },
            {
                app_version_id: 'v2-id',
                app_id: APP_UUID,
                version: 2,
                prompt: 'Add a bar chart for revenue',
                status: 'ready' as const,
                error: null,
                status_message: null,
                status_updated_at: null,
                resources: null,
                viz_schema: null,
                created_at: new Date('2024-01-02T10:00:00Z'),
                created_by_user_uuid: 'user-uuid',
                created_by_user_first_name: 'Test',
                created_by_user_last_name: 'User',
            },
        ];

        const appModel = {
            getApp: vi.fn().mockResolvedValue({ ...fakeApp, version: VERSION }),
            getLatestReadyVersion: vi.fn().mockResolvedValue(fakeAppVersion),
            getAppWithVersions: vi
                .fn()
                .mockResolvedValue({ versions, hasMore: false }),
        };

        const svc = buildService({
            appModel,
            s3ClientOverride: fakeS3,
            projectModel: {
                getAllExploresFromCache: vi.fn().mockResolvedValue({}),
            },
            projectParametersModel: {
                find: vi.fn().mockResolvedValue([]),
            },
            organizationDesignModel: {
                findInOrganization: vi.fn().mockResolvedValue(null),
            },
        });

        const result = await svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID);

        // semantic layer context file is always present
        expect(result.context.semanticLayer.path).toBe(
            '.lightdash/context/semantic-layer.yml',
        );

        // empty parameters → null
        expect(result.context.parameters).toBeNull();

        // prompt history includes both prompts (newest-first ordering)
        const promptHistoryContent = Buffer.from(
            result.context.promptHistory.contentBase64,
            'base64',
        ).toString('utf8');
        expect(promptHistoryContent).toContain('Build a sales dashboard');
        expect(promptHistoryContent).toContain('Add a bar chart for revenue');

        // no theme (design_uuid is null) → empty theme with skippedAssetCount 0
        expect(result.context.theme.skippedAssetCount).toBe(0);
        expect(result.context.theme.assets).toHaveLength(0);
        expect(result.context.theme.instructions).toBeNull();
    });
});
