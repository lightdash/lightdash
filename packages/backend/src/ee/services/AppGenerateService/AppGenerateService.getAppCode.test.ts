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
}): AppGenerateService {
    const { appModel = {}, s3ClientOverride } = overrides;

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
        appModel: appModel as never,
        featureFlagModel: featureFlagModel as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: spacePermissionService as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
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
});
