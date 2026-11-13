import {
    CopyObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { Ability } from '@casl/ability';
import {
    NotFoundError,
    ProjectType,
    type AppBuildFromSourceJobPayload,
    type AppVersionStatus,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import {
    buildAppThumbnailClientMock,
    createInMemoryAppThumbnailStorage,
} from '../../clients/AppThumbnailClient.mock';
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

const BUCKET = 'test-bucket';
const ORGANIZATION_UUID = 'organization';
const PREVIEW_PROJECT_UUID = 'preview-project';
const PRODUCTION_PROJECT_UUID = 'production-project';
const APP_UUID = 'revenue-app';
const UPSTREAM_APP_UUID = 'upstream-revenue-app';
const AUTHOR_UUID = 'author';
const USER_UUID = 'user';

const MANUAL_IMAGE = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('hand-picked state'),
]);

type AppRow = {
    app_id: string;
    project_uuid: string;
    organization_uuid: string;
    space_uuid: null;
    design_uuid: null;
    sandbox_id: null;
    upstream_app_uuid: string | null;
    template: string;
    name: string;
    slug: string;
    description: null;
    icon: null;
    created_by_user_uuid: string;
    deleted_at: null;
    deleted_by_user_uuid: null;
    registry_slug: null;
};

type VersionRow = {
    app_id: string;
    version: number;
    app_thread_uuid: string;
    prompt: string;
    status: AppVersionStatus;
    created_by_user_uuid: string;
    thumbnail_captured_at: Date | null;
    thumbnail_is_manual: boolean | null;
    resources: null;
    dependencies: null;
    viz_schema: null;
    viz_preview: null;
    registry_version: null;
    data_references: null;
};

type VersionSeed = {
    version: number;
    status: AppVersionStatus;
    appUuid?: string;
};

const makeUser = (userUuid: string = USER_UUID): SessionUser => {
    const ability = new Ability([{ action: 'manage', subject: 'DataApp' }]);
    return {
        userUuid,
        organizationUuid: ORGANIZATION_UUID,
        isActive: true,
        ability,
        abilityRules: ability.rules,
    } as SessionUser;
};

function buildScenario({
    versions,
    promotedBefore = false,
}: {
    versions: VersionSeed[];
    promotedBefore?: boolean;
}) {
    const state = {
        buildFails: false,
        appDeletedDuringBuild: false,
    };

    const makeApp = (overrides: Partial<AppRow>): AppRow => ({
        app_id: APP_UUID,
        project_uuid: PREVIEW_PROJECT_UUID,
        organization_uuid: ORGANIZATION_UUID,
        space_uuid: null,
        design_uuid: null,
        sandbox_id: null,
        upstream_app_uuid: null,
        template: 'dashboard',
        name: 'Revenue app',
        slug: 'revenue-app',
        description: null,
        icon: null,
        created_by_user_uuid: USER_UUID,
        deleted_at: null,
        deleted_by_user_uuid: null,
        registry_slug: null,
        ...overrides,
    });
    const apps = new Map<string, AppRow>([
        [
            APP_UUID,
            makeApp({
                upstream_app_uuid: promotedBefore ? UPSTREAM_APP_UUID : null,
            }),
        ],
        [
            UPSTREAM_APP_UUID,
            makeApp({
                app_id: UPSTREAM_APP_UUID,
                project_uuid: PRODUCTION_PROJECT_UUID,
            }),
        ],
    ]);

    const versionRows: VersionRow[] = [];
    const addVersion = (
        appUuid: string,
        version: number,
        status: AppVersionStatus,
        createdByUserUuid: string,
    ): VersionRow => {
        const row: VersionRow = {
            app_id: appUuid,
            version,
            app_thread_uuid: `${appUuid}-thread-1`,
            prompt: 'Build it',
            status,
            created_by_user_uuid: createdByUserUuid,
            thumbnail_captured_at: null,
            thumbnail_is_manual: null,
            resources: null,
            dependencies: null,
            viz_schema: null,
            viz_preview: null,
            registry_version: null,
            data_references: null,
        };
        versionRows.push(row);
        return row;
    };
    versions.forEach((seed) =>
        addVersion(
            seed.appUuid ?? APP_UUID,
            seed.version,
            seed.status,
            AUTHOR_UUID,
        ),
    );
    const versionsOf = (appUuid: string) =>
        versionRows
            .filter((row) => row.app_id === appUuid)
            .sort((a, b) => a.version - b.version);
    const findVersion = (appUuid: string, version: number) =>
        versionsOf(appUuid).find((row) => row.version === version);

    const objects = new Map<string, Buffer>();
    const missingObject = () =>
        new S3ServiceException({
            name: 'NotFound',
            $fault: 'client',
            $metadata: { httpStatusCode: 404 },
        });
    const s3Client = {
        send: async (command: unknown) => {
            if (command instanceof ListObjectsV2Command) {
                const prefix = command.input.Prefix ?? '';
                return {
                    Contents: [...objects.keys()]
                        .filter((key) => key.startsWith(prefix))
                        .map((Key) => ({ Key })),
                };
            }
            if (command instanceof CopyObjectCommand) {
                const sourceKey = (command.input.CopySource ?? '').replace(
                    `/${BUCKET}/`,
                    '',
                );
                const value = objects.get(sourceKey);
                if (!value) throw missingObject();
                objects.set(command.input.Key!, value);
                return {};
            }
            if (command instanceof PutObjectCommand) {
                objects.set(command.input.Key!, command.input.Body as Buffer);
                return {};
            }
            if (command instanceof HeadObjectCommand) {
                if (!objects.has(command.input.Key!)) throw missingObject();
                return {};
            }
            if (command instanceof DeleteObjectCommand) {
                objects.delete(command.input.Key!);
                return {};
            }
            return {};
        },
    };

    const appModel = {
        getApp: async (appUuid: string, projectUuid: string) => {
            const app = apps.get(appUuid);
            if (!app || app.project_uuid !== projectUuid) {
                throw new NotFoundError('App not found');
            }
            return app;
        },
        findAppByUuid: async (appUuid: string) => apps.get(appUuid),
        getLatestReadyVersion: async (appUuid: string) =>
            versionsOf(appUuid).findLast((row) => row.status === 'ready') ??
            null,
        getLatestVersion: async (appUuid: string) => versionsOf(appUuid).at(-1),
        getVersion: async (appUuid: string, version: number) =>
            findVersion(appUuid, version) ?? null,
        getCurrentThread: async (appUuid: string) => ({
            app_thread_uuid: `${appUuid}-thread-1`,
        }),
        createVersion: async (
            appUuid: string,
            input: { version: number },
            status: AppVersionStatus,
            createdByUserUuid: string,
        ) => addVersion(appUuid, input.version, status, createdByUserUuid),
        createWithVersion: async (
            app: Partial<AppRow> & { app_id: string; project_uuid: string },
            input: { version: number },
            status: AppVersionStatus,
        ) => {
            const row = makeApp({ ...app, slug: `${app.app_id}-slug` });
            apps.set(row.app_id, row);
            const version = addVersion(
                row.app_id,
                input.version,
                status,
                row.created_by_user_uuid,
            );
            return { app: row, version };
        },
        updateVersionStatusIfInProgress: async (
            appUuid: string,
            version: number,
            status: AppVersionStatus,
        ) => {
            const row = findVersion(appUuid, version);
            if (!row || row.status === 'ready' || row.status === 'error') {
                return false;
            }
            row.status = status;
            return true;
        },
        hasAnyVersionThumbnail: async (appUuid: string) =>
            versionsOf(appUuid).some(
                (row) => row.thumbnail_captured_at !== null,
            ),
        setVersionThumbnail: async (appUuid: string, version: number) => {
            const row = findVersion(appUuid, version);
            if (!row) return false;
            row.thumbnail_captured_at = new Date();
            row.thumbnail_is_manual = true;
            return true;
        },
        clearVersionThumbnail: async (appUuid: string, version: number) => {
            const row = findVersion(appUuid, version);
            if (!row) return;
            row.thumbnail_captured_at = null;
            row.thumbnail_is_manual = null;
        },
        setUpstreamAppUuid: async (appUuid: string, upstream: string) => {
            apps.get(appUuid)!.upstream_app_uuid = upstream;
        },
        syncPromotedApp: async () => undefined,
        updateStatusMessage: async () => undefined,
        updateSandboxUuid: async () => undefined,
        touchVersionIfInProgress: async () => undefined,
        recordBuildNarration: async () => undefined,
    };

    const thumbnailStorage = createInMemoryAppThumbnailStorage();
    // Every job the service enqueues, by scheduler method name.
    const enqueuedJobs: string[] = [];
    const schedulerClient = new Proxy(
        {},
        {
            get: (_target, method) => async () => {
                enqueuedJobs.push(String(method));
                return { jobId: 'job' };
            },
        },
    );
    const projectSummary = (projectUuid: string) => ({
        projectUuid,
        organizationUuid: ORGANIZATION_UUID,
        name: projectUuid,
        type:
            projectUuid === PREVIEW_PROJECT_UUID
                ? ProjectType.PREVIEW
                : ProjectType.DEFAULT,
        createdByUserUuid: USER_UUID,
        upstreamProjectUuid:
            projectUuid === PREVIEW_PROJECT_UUID
                ? PRODUCTION_PROJECT_UUID
                : null,
    });

    const service = new AppGenerateService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
        lightdashConfig: {
            appRuntime: {
                dataAppCodingAgent: 'claude',
                dependencyRegistryHosts: [],
                otel: { enabled: false },
            },
        } as never,
        analytics: { track: () => undefined } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {
            findSessionUserAndOrgByUuid: async (userUuid: string) =>
                makeUser(userUuid),
            findServiceAccountByUserUuid: async () => undefined,
        } as never,
        appModel: appModel as never,
        chartRegistryClient: {} as never,
        contentVerificationModel: {
            getByContent: async () => null,
            verify: async () => undefined,
            unverify: async () => undefined,
        } as never,
        featureFlagModel: { get: async () => ({ enabled: true }) } as never,
        organizationSettingsModel: {} as never,
        organizationDesignModel: {
            findInOrganization: async () => null,
        } as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: async (projectUuid: string) =>
                projectSummary(projectUuid),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: schedulerClient as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: async () => ({
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PREVIEW_PROJECT_UUID,
                inheritsFromOrgOrProject: false,
                access: [],
                admins: [],
                directOnly: false,
            }),
        } as never,
        coderService: {} as never,
        documentService: {} as never,
        composerChartService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {
            listAppLinks: async () => [],
            replaceAppLinks: async () => undefined,
        } as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {
            getClaudeCodeConfig: async () => ({
                defaultProvider: 'anthropic',
                providers: { anthropic: { apiKey: 'test-key' } },
            }),
        } as never,
        sandboxManager: null,
        appRuntimeS3: { client: s3Client as never, bucket: BUCKET },
        appThumbnailClient: buildAppThumbnailClientMock({
            appModel: appModel as never,
            storage: thumbnailStorage.storage,
        }),
    });

    /** What a viewer of the app sees: the latest ready version's thumbnail. */
    const thumbnailOf = async (
        appUuid: string,
        projectUuid: string = PREVIEW_PROJECT_UUID,
    ): Promise<string | null> => {
        try {
            const { thumbnailUrl } = await service.getThumbnailUrl(
                makeUser(),
                projectUuid,
                appUuid,
            );
            return thumbnailStorage.download(thumbnailUrl);
        } catch (error) {
            if (error instanceof NotFoundError) return null;
            throw error;
        }
    };

    /**
     * A version captured by the removed automatic capture: the row and the
     * `automatic.png` object an older release left behind.
     */
    const seedAutomaticThumbnail = (version: number) => {
        const row = findVersion(APP_UUID, version)!;
        row.thumbnail_captured_at = new Date();
        row.thumbnail_is_manual = false;
        thumbnailStorage.objects.set(
            `apps/${APP_UUID}/thumbnails/${version}/automatic.png`,
            Buffer.from(`automatic capture of v${version}`),
        );
    };

    const captureManually = (version: number) =>
        service.uploadThumbnail(
            makeUser(),
            PREVIEW_PROJECT_UUID,
            'image/png',
            Readable.from([MANUAL_IMAGE]),
            MANUAL_IMAGE.length,
            APP_UUID,
            version,
        );

    const loseStoredImage = (image: string) => {
        const { objects: images } = thumbnailStorage;
        [...images.entries()]
            .filter(([, value]) => value.toString() === image)
            .forEach(([key]) => images.delete(key));
    };

    /** The build an uploaded version goes through, with the sandbox stubbed. */
    const buildUploadedVersion = async (version: number) => {
        const pipeline = service as unknown as Record<string, unknown>;
        pipeline.createSandbox = async () => ({
            sandbox: {},
            sandboxUuid: 'sandbox',
        });
        pipeline.restoreSourceFromS3 = async () => 1;
        pipeline.runBuild = async () => {
            if (state.appDeletedDuringBuild) apps.delete(APP_UUID);
            return state.buildFails
                ? { exitCode: 1, stdout: '', stderr: 'boom' }
                : { exitCode: 0, stdout: '', stderr: '' };
        };
        pipeline.packageArtifacts = async () => ({
            distTar: Buffer.from('dist'),
            sourceTar: Buffer.from('src'),
        });
        pipeline.uploadToS3 = async () => 1;
        pipeline.suspendSandbox = async () => undefined;
        pipeline.markError = async () => {
            findVersion(APP_UUID, version)!.status = 'error';
            return true;
        };
        const payload: AppBuildFromSourceJobPayload = {
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PREVIEW_PROJECT_UUID,
            userUuid: AUTHOR_UUID,
            appUuid: APP_UUID,
            version,
        };
        await service.runBuildFromSourcePipeline(payload);
        return findVersion(APP_UUID, version)!.status;
    };

    return {
        service,
        state,
        apps,
        enqueuedJobs,
        thumbnailOf,
        seedAutomaticThumbnail,
        captureManually,
        loseStoredImage,
        buildUploadedVersion,
    };
}

const twoReadyVersions: VersionSeed[] = [
    { version: 1, status: 'ready' },
    { version: 2, status: 'ready' },
];

const MANUAL = MANUAL_IMAGE.toString();

describe('AppGenerateService thumbnails for versions created without a build', () => {
    describe('restore', () => {
        const restoreFirstVersion = (
            s: ReturnType<typeof buildScenario>,
        ): Promise<{ appUuid: string; version: number }> =>
            s.service.restoreVersion(
                makeUser(),
                PREVIEW_PROJECT_UUID,
                APP_UUID,
                1,
            );

        it("gives the new version the source version's manual thumbnail", async () => {
            const s = buildScenario({ versions: twoReadyVersions });
            await s.captureManually(1);
            expect(await s.thumbnailOf(APP_UUID)).toBeNull();

            const restored = await restoreFirstVersion(s);

            expect(restored.version).toBe(3);
            expect(await s.thumbnailOf(APP_UUID)).toBe(MANUAL);
        });

        it('leaves the new version without a thumbnail when the source has none', async () => {
            const s = buildScenario({ versions: twoReadyVersions });
            await s.captureManually(2);

            const restored = await restoreFirstVersion(s);

            expect(restored.version).toBe(3);
            expect(await s.thumbnailOf(APP_UUID)).toBeNull();
        });

        it('does not carry over an automatic thumbnail from an older release', async () => {
            const s = buildScenario({ versions: twoReadyVersions });
            s.seedAutomaticThumbnail(1);

            await restoreFirstVersion(s);

            expect(await s.thumbnailOf(APP_UUID)).toBeNull();
        });

        it('still restores when the source image cannot be copied', async () => {
            const s = buildScenario({ versions: twoReadyVersions });
            await s.captureManually(1);
            s.loseStoredImage(MANUAL);

            const restored = await restoreFirstVersion(s);

            expect(restored.version).toBe(3);
            expect(await s.thumbnailOf(APP_UUID)).toBeNull();
        });
    });

    describe('duplicate', () => {
        const duplicate = (s: ReturnType<typeof buildScenario>) =>
            s.service.duplicateApp(makeUser(), PREVIEW_PROJECT_UUID, APP_UUID);

        it("gives the duplicate's first version the source version's manual thumbnail", async () => {
            const s = buildScenario({ versions: twoReadyVersions });
            await s.captureManually(2);

            const copy = await duplicate(s);

            expect(await s.thumbnailOf(copy.appUuid)).toBe(MANUAL);
        });

        it('leaves the duplicate without a thumbnail when the source version has none', async () => {
            const s = buildScenario({ versions: twoReadyVersions });
            await s.captureManually(1);

            const copy = await duplicate(s);

            expect(copy.version).toBe(1);
            expect(await s.thumbnailOf(copy.appUuid)).toBeNull();
        });

        it('does not carry over an automatic thumbnail from an older release', async () => {
            const s = buildScenario({ versions: twoReadyVersions });
            s.seedAutomaticThumbnail(2);

            const copy = await duplicate(s);

            expect(await s.thumbnailOf(copy.appUuid)).toBeNull();
        });

        it('still duplicates when the source image cannot be copied', async () => {
            const s = buildScenario({ versions: twoReadyVersions });
            await s.captureManually(2);
            s.loseStoredImage(MANUAL);

            const copy = await duplicate(s);

            expect(copy.version).toBe(1);
            expect(await s.thumbnailOf(copy.appUuid)).toBeNull();
        });
    });

    describe('promote', () => {
        const promote = (s: ReturnType<typeof buildScenario>) =>
            s.service.promoteApp(makeUser(), PREVIEW_PROJECT_UUID, APP_UUID);

        it('queues no capture and leaves the upstream version without the preview image', async () => {
            const s = buildScenario({
                versions: [
                    { version: 3, status: 'ready' },
                    {
                        appUuid: UPSTREAM_APP_UUID,
                        version: 6,
                        status: 'ready',
                    },
                ],
                promotedBefore: true,
            });
            await s.captureManually(3);

            const promoted = await promote(s);

            expect(promoted).toMatchObject({
                appUuid: UPSTREAM_APP_UUID,
                version: 7,
                action: 'update',
            });
            expect(s.enqueuedJobs).toEqual([]);
            expect(
                await s.thumbnailOf(UPSTREAM_APP_UUID, PRODUCTION_PROJECT_UUID),
            ).toBeNull();
        });

        it('queues no capture for the first version of a newly promoted app', async () => {
            const s = buildScenario({
                versions: [{ version: 3, status: 'ready' }],
            });

            const promoted = await promote(s);

            expect(promoted).toMatchObject({ version: 1, action: 'create' });
            expect(s.enqueuedJobs).toEqual([]);
            expect(
                await s.thumbnailOf(promoted.appUuid, PRODUCTION_PROJECT_UUID),
            ).toBeNull();
        });
    });

    describe('data apps as code upload', () => {
        const uploadedVersion: VersionSeed[] = [
            { version: 1, status: 'ready' },
            { version: 2, status: 'pending' },
        ];

        it('queues no capture once the uploaded version is ready', async () => {
            const s = buildScenario({ versions: uploadedVersion });

            const status = await s.buildUploadedVersion(2);

            expect(status).toBe('ready');
            expect(s.enqueuedJobs).toEqual([]);
            expect(await s.thumbnailOf(APP_UUID)).toBeNull();
        });

        it('keeps showing the previous version when the upload fails to build', async () => {
            const s = buildScenario({ versions: uploadedVersion });
            await s.captureManually(1);
            s.state.buildFails = true;

            const status = await s.buildUploadedVersion(2);

            expect(status).toBe('error');
            expect(await s.thumbnailOf(APP_UUID)).toBe(MANUAL);
        });

        it('leaves the upload ready when the app is deleted while it builds', async () => {
            const s = buildScenario({ versions: uploadedVersion });
            s.state.appDeletedDuringBuild = true;

            const status = await s.buildUploadedVersion(2);

            expect(status).toBe('ready');
        });
    });
});
