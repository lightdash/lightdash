import {
    ForbiddenError,
    NotFoundError,
    type AppVersionStatus,
    type SessionUser,
} from '@lightdash/common';
import {
    appLevelThumbnailKey,
    AppThumbnails,
    type AppThumbnailObjectStorage,
    type AppThumbnailVersionStore,
    type ThumbnailApp,
    type ThumbnailVersion,
} from './appThumbnails';

const APP_UUID = 'app-1';
const PROJECT_UUID = 'project-1';
const ORGANIZATION_UUID = 'org-1';
const CREATOR_UUID = 'creator-1';
const APP = { projectUuid: PROJECT_UUID, appUuid: APP_UUID };

const asUser = (userUuid: string) => ({ userUuid }) as SessionUser;
const manager = asUser('manager-1');
const viewer = asUser('viewer-1');
const stranger = asUser('stranger-1');

const image = (label: string) => Buffer.from(label);

type AppSeed = Partial<Pick<ThumbnailApp, 'appUuid' | 'isCustomChartType'>>;
type VersionSeed = {
    version: number;
    status: AppVersionStatus;
    createdByUserUuid?: string;
    appUuid?: string;
};

const buildScenario = ({
    apps = [{}],
    versions = [],
    legacyImage = null,
}: {
    apps?: AppSeed[];
    versions?: VersionSeed[];
    legacyImage?: Buffer | null;
} = {}) => {
    const appRows = new Map<string, ThumbnailApp>(
        apps.map((seed) => {
            const app: ThumbnailApp = {
                appUuid: seed.appUuid ?? APP_UUID,
                projectUuid: PROJECT_UUID,
                organizationUuid: ORGANIZATION_UUID,
                spaceUuid: null,
                createdByUserUuid: CREATOR_UUID,
                name: 'Revenue app',
                isCustomChartType: seed.isCustomChartType ?? false,
            };
            return [app.appUuid, app];
        }),
    );
    const versionRows = new Map<string, ThumbnailVersion[]>();
    const versionsOf = (appUuid: string) => versionRows.get(appUuid) ?? [];
    const addVersion = (seed: VersionSeed) => {
        const appUuid = seed.appUuid ?? APP_UUID;
        versionRows.set(appUuid, [
            ...versionsOf(appUuid),
            {
                version: seed.version,
                status: seed.status,
                createdByUserUuid: seed.createdByUserUuid ?? CREATOR_UUID,
                thumbnail: null,
            },
        ]);
    };
    versions.forEach(addVersion);
    const findRow = (appUuid: string, version: number) =>
        versionsOf(appUuid).find((row) => row.version === version) ?? null;

    const versionStore: AppThumbnailVersionStore = {
        getApp: async (appUuid, projectUuid) => {
            const app = appRows.get(appUuid);
            if (!app || app.projectUuid !== projectUuid) {
                throw new NotFoundError(`App not found: ${appUuid}`);
            }
            return app;
        },
        findAppByUuid: async (appUuid) => appRows.get(appUuid) ?? null,
        findVersion: async (appUuid, version) => {
            const row = findRow(appUuid, version);
            return row ? { ...row } : null;
        },
        findLatestReadyVersion: async (appUuid) => {
            const ready = versionsOf(appUuid)
                .filter((row) => row.status === 'ready')
                .sort((a, b) => b.version - a.version);
            return ready.length > 0 ? { ...ready[0] } : null;
        },
        hasAnyVersionThumbnail: async (appUuid) =>
            versionsOf(appUuid).some((row) => row.thumbnail !== null),
        setThumbnail: async (appUuid, version, { isManual }) => {
            const row = findRow(appUuid, version);
            if (!row) return false;
            if (!isManual && row.thumbnail?.isManual) return false;
            row.thumbnail = { isManual };
            return true;
        },
        clearThumbnail: async (appUuid, version) => {
            const row = findRow(appUuid, version);
            if (row) row.thumbnail = null;
        },
    };

    const objects = new Map<string, Buffer>();
    const urlPrefix = 'https://storage.test/';
    const objectStorage: AppThumbnailObjectStorage = {
        put: async (key, body) => {
            objects.set(key, body);
        },
        exists: async (key) => objects.has(key),
        copy: async (fromKey, toKey) => {
            const body = objects.get(fromKey);
            if (!body) throw new Error(`No such object: ${fromKey}`);
            objects.set(toKey, body);
        },
        delete: async (key) => {
            objects.delete(key);
        },
        getSignedUrl: async (key) => `${urlPrefix}${key}`,
    };
    /** What a browser following the signed URL would download. */
    const download = (url: string | null): string | null => {
        if (url === null) return null;
        return objects.get(url.slice(urlPrefix.length))?.toString() ?? null;
    };

    const state = {
        headlessBrowserConfigured: true,
        automaticCaptureEnabled: true,
        renderFails: false,
        // Runs while the headless render is in flight.
        duringRender: async () => {},
    };

    const thumbnails = new AppThumbnails({
        versionStore,
        objectStorage,
        capture: {
            isAvailable: () => state.headlessBrowserConfigured,
            render: async ({ app, version, asUserUuid }) => {
                await state.duringRender();
                if (state.renderFails) throw new Error('Render timed out');
                return image(
                    `render of ${app.appUuid} v${version} as ${asUserUuid}`,
                );
            },
        },
        settings: {
            isAutomaticCaptureEnabled: async () =>
                state.automaticCaptureEnabled,
        },
        access: {
            assertCanView: async (user) => {
                if (user.userUuid === stranger.userUuid) {
                    throw new ForbiddenError('Cannot view app');
                }
            },
            assertCanManage: async (user) => {
                if (user.userUuid !== manager.userUuid) {
                    throw new ForbiddenError('Cannot manage app');
                }
            },
        },
    });

    if (legacyImage) {
        objects.set(appLevelThumbnailKey(APP_UUID), legacyImage);
    }

    return {
        thumbnails,
        state,
        addVersion,
        statusOf: (version: number, appUuid = APP_UUID) =>
            findRow(appUuid, version)?.status ?? null,
        /** A build finished: the version is ready and its capture job runs. */
        becomeReady: async (seed: Omit<VersionSeed, 'status'>) => {
            addVersion({ ...seed, status: 'ready' });
            await thumbnails.captureVersion({
                appUuid: seed.appUuid ?? APP_UUID,
                version: seed.version,
            });
        },
        appThumbnail: async (user = viewer, app = APP) =>
            download(await thumbnails.getAppThumbnailUrl(user, app)),
        versionThumbnail: async (version: number, user = viewer, app = APP) =>
            download(
                await thumbnails.getVersionThumbnailUrl(user, {
                    ...app,
                    version,
                }),
            ),
    };
};

describe('AppThumbnails', () => {
    describe('automatic capture when a version becomes ready', () => {
        it('gives the version a thumbnail rendered as its creator', async () => {
            const s = buildScenario();

            await s.becomeReady({ version: 1, createdByUserUuid: 'ada' });

            expect(await s.versionThumbnail(1)).toBe(
                'render of app-1 v1 as ada',
            );
        });

        it('still captures a version that was superseded before its capture ran', async () => {
            const s = buildScenario({
                versions: [
                    { version: 1, status: 'ready' },
                    { version: 2, status: 'ready' },
                ],
            });

            await s.thumbnails.captureVersion({
                appUuid: APP_UUID,
                version: 1,
            });

            expect(await s.versionThumbnail(1)).toBe(
                `render of app-1 v1 as ${CREATOR_UUID}`,
            );
        });

        it('captures nothing while automatic capture is turned off for the organization', async () => {
            const s = buildScenario();
            s.state.automaticCaptureEnabled = false;

            await s.becomeReady({ version: 1 });

            expect(await s.versionThumbnail(1)).toBeNull();
            expect(
                await s.thumbnails.isAutomaticCaptureEnabled({
                    organizationUuid: ORGANIZATION_UUID,
                    isCustomChartType: false,
                }),
            ).toBe(false);
        });

        it('captures nothing when no headless browser is configured', async () => {
            const s = buildScenario();
            s.state.headlessBrowserConfigured = false;

            await s.becomeReady({ version: 1 });

            expect(await s.versionThumbnail(1)).toBeNull();
            expect(
                await s.thumbnails.isAutomaticCaptureEnabled({
                    organizationUuid: ORGANIZATION_UUID,
                    isCustomChartType: false,
                }),
            ).toBe(false);
        });

        it('captures nothing for a custom chart type', async () => {
            const s = buildScenario({ apps: [{ isCustomChartType: true }] });

            await s.becomeReady({ version: 1 });

            expect(await s.versionThumbnail(1)).toBeNull();
            expect(await s.appThumbnail()).toBeNull();
        });

        it('captures nothing for a version that is not ready', async () => {
            const s = buildScenario({
                versions: [
                    { version: 1, status: 'error' },
                    { version: 2, status: 'building' },
                ],
            });

            await s.thumbnails.captureVersion({
                appUuid: APP_UUID,
                version: 1,
            });
            await s.thumbnails.captureVersion({
                appUuid: APP_UUID,
                version: 2,
            });
            await s.thumbnails.captureVersion({
                appUuid: APP_UUID,
                version: 3,
            });

            expect(await s.versionThumbnail(1)).toBeNull();
            expect(await s.versionThumbnail(2)).toBeNull();
            expect(await s.versionThumbnail(3)).toBeNull();
        });

        it('leaves the version ready and without a thumbnail when the capture fails', async () => {
            const s = buildScenario();
            s.state.renderFails = true;

            await s.becomeReady({ version: 1 });

            expect(s.statusOf(1)).toBe('ready');
            expect(await s.versionThumbnail(1)).toBeNull();
            expect(await s.appThumbnail()).toBeNull();
        });
    });

    describe("a data app's thumbnail", () => {
        it("is its latest ready version's thumbnail", async () => {
            const s = buildScenario();

            await s.becomeReady({ version: 1 });
            await s.becomeReady({ version: 2 });

            expect(await s.appThumbnail()).toBe(
                `render of app-1 v2 as ${CREATOR_UUID}`,
            );
        });

        it('is not changed by a newer version that is building or failed', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });

            s.addVersion({ version: 2, status: 'error' });
            s.addVersion({ version: 3, status: 'building' });

            expect(await s.appThumbnail()).toBe(
                `render of app-1 v1 as ${CREATOR_UUID}`,
            );
        });

        it('is none when the latest ready version has none, even if older versions have one', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });

            s.state.renderFails = true;
            await s.becomeReady({ version: 2 });

            expect(await s.versionThumbnail(1)).not.toBeNull();
            expect(await s.appThumbnail()).toBeNull();
        });

        it('is the old app-level image only while no version has a thumbnail', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
                legacyImage: image('old app-level image'),
            });
            expect(await s.appThumbnail()).toBe('old app-level image');

            await s.becomeReady({ version: 2 });
            expect(await s.appThumbnail()).toBe(
                `render of app-1 v2 as ${CREATOR_UUID}`,
            );

            // v3 has no thumbnail, but v2 does: the old image stays ignored.
            s.state.renderFails = true;
            await s.becomeReady({ version: 3 });
            expect(await s.appThumbnail()).toBeNull();
        });

        it('stays the app-level image for a custom chart type', async () => {
            const s = buildScenario({
                apps: [{ isCustomChartType: true }],
                versions: [{ version: 1, status: 'ready' }],
            });

            await s.thumbnails.setManualThumbnail(manager, {
                ...APP,
                version: null,
                image: image('chart type image'),
            });

            expect(await s.appThumbnail()).toBe('chart type image');
            expect(await s.versionThumbnail(1)).toBeNull();

            await s.thumbnails.removeThumbnail(manager, {
                ...APP,
                version: null,
            });
            expect(await s.appThumbnail()).toBeNull();
        });
    });

    describe('manual capture', () => {
        it("replaces the version's thumbnail", async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });

            await s.thumbnails.setManualThumbnail(manager, {
                ...APP,
                version: 1,
                image: image('hand-picked state'),
            });

            expect(await s.versionThumbnail(1)).toBe('hand-picked state');
            expect(await s.appThumbnail()).toBe('hand-picked state');
        });

        it('targets the version being viewed, not the latest', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });
            await s.becomeReady({ version: 2 });

            await s.thumbnails.setManualThumbnail(manager, {
                ...APP,
                version: 1,
                image: image('hand-picked state'),
            });

            expect(await s.versionThumbnail(1)).toBe('hand-picked state');
            expect(await s.versionThumbnail(2)).toBe(
                `render of app-1 v2 as ${CREATOR_UUID}`,
            );
        });

        it('targets the latest ready version when no version is given', async () => {
            const s = buildScenario({
                versions: [
                    { version: 1, status: 'ready' },
                    { version: 2, status: 'ready' },
                    { version: 3, status: 'building' },
                ],
            });

            const saved = await s.thumbnails.setManualThumbnail(manager, {
                ...APP,
                version: null,
                image: image('hand-picked state'),
            });

            expect(saved.version).toBe(2);
            expect(await s.versionThumbnail(2)).toBe('hand-picked state');
            expect(await s.versionThumbnail(1)).toBeNull();
        });

        it('is refused for a version that is not ready', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'building' }],
            });

            await expect(
                s.thumbnails.setManualThumbnail(manager, {
                    ...APP,
                    version: 1,
                    image: image('hand-picked state'),
                }),
            ).rejects.toThrow();
            await expect(
                s.thumbnails.setManualThumbnail(manager, {
                    ...APP,
                    version: 7,
                    image: image('hand-picked state'),
                }),
            ).rejects.toThrow(NotFoundError);
            expect(await s.versionThumbnail(1)).toBeNull();
        });

        it('survives an automatic capture of the same version that runs later', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            await s.thumbnails.setManualThumbnail(manager, {
                ...APP,
                version: 1,
                image: image('hand-picked state'),
            });

            await s.thumbnails.captureVersion({
                appUuid: APP_UUID,
                version: 1,
            });

            expect(await s.versionThumbnail(1)).toBe('hand-picked state');
        });

        it('survives an automatic capture that was already rendering', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            s.state.duringRender = async () => {
                await s.thumbnails.setManualThumbnail(manager, {
                    ...APP,
                    version: 1,
                    image: image('hand-picked state'),
                });
            };

            await s.thumbnails.captureVersion({
                appUuid: APP_UUID,
                version: 1,
            });

            expect(await s.versionThumbnail(1)).toBe('hand-picked state');
        });
    });

    describe('remove', () => {
        it("deletes the version's thumbnail and the old app-level image", async () => {
            const s = buildScenario({
                legacyImage: image('old app-level image'),
            });
            await s.becomeReady({ version: 1 });

            await s.thumbnails.removeThumbnail(manager, {
                ...APP,
                version: 1,
            });

            expect(await s.versionThumbnail(1)).toBeNull();
            expect(await s.appThumbnail()).toBeNull();
        });

        it('deletes a manual thumbnail', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });
            await s.thumbnails.setManualThumbnail(manager, {
                ...APP,
                version: 1,
                image: image('hand-picked state'),
            });

            await s.thumbnails.removeThumbnail(manager, {
                ...APP,
                version: null,
            });

            expect(await s.versionThumbnail(1)).toBeNull();
            expect(await s.appThumbnail()).toBeNull();
        });

        it('deletes the old app-level image of an app with no ready version', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'error' }],
                legacyImage: image('old app-level image'),
            });

            await s.thumbnails.removeThumbnail(manager, {
                ...APP,
                version: null,
            });

            expect(await s.appThumbnail()).toBeNull();
        });

        it('is not sticky: the next version is still captured', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });
            await s.thumbnails.removeThumbnail(manager, {
                ...APP,
                version: null,
            });

            await s.becomeReady({ version: 2 });

            expect(await s.appThumbnail()).toBe(
                `render of app-1 v2 as ${CREATOR_UUID}`,
            );
        });
    });

    describe('copy between versions', () => {
        it("gives a restored version the source version's thumbnail", async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });
            s.state.renderFails = true;
            await s.becomeReady({ version: 2 });

            s.addVersion({ version: 3, status: 'ready' });
            await s.thumbnails.copyThumbnail({
                from: { appUuid: APP_UUID, version: 1 },
                to: { appUuid: APP_UUID, version: 3 },
            });

            expect(await s.versionThumbnail(3)).toBe(
                `render of app-1 v1 as ${CREATOR_UUID}`,
            );
            expect(await s.appThumbnail()).toBe(
                `render of app-1 v1 as ${CREATOR_UUID}`,
            );
        });

        it("gives a duplicate's first version the source version's thumbnail, even with automatic capture off", async () => {
            const s = buildScenario({
                apps: [{}, { appUuid: 'app-copy' }],
            });
            await s.becomeReady({ version: 4 });
            await s.thumbnails.setManualThumbnail(manager, {
                ...APP,
                version: 4,
                image: image('hand-picked state'),
            });
            s.state.automaticCaptureEnabled = false;

            s.addVersion({ appUuid: 'app-copy', version: 1, status: 'ready' });
            await s.thumbnails.copyThumbnail({
                from: { appUuid: APP_UUID, version: 4 },
                to: { appUuid: 'app-copy', version: 1 },
            });

            const copy = { projectUuid: PROJECT_UUID, appUuid: 'app-copy' };
            expect(await s.versionThumbnail(1, viewer, copy)).toBe(
                'hand-picked state',
            );
            expect(await s.appThumbnail(viewer, copy)).toBe(
                'hand-picked state',
            );
        });

        it('copies nothing from a version without a thumbnail', async () => {
            const s = buildScenario({
                versions: [
                    { version: 1, status: 'ready' },
                    { version: 2, status: 'ready' },
                ],
            });

            await s.thumbnails.copyThumbnail({
                from: { appUuid: APP_UUID, version: 1 },
                to: { appUuid: APP_UUID, version: 2 },
            });

            expect(await s.versionThumbnail(2)).toBeNull();
        });
    });

    describe('permissions', () => {
        it('lets anyone who can view the app read its thumbnails', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });

            expect(await s.appThumbnail(viewer)).not.toBeNull();
            expect(await s.versionThumbnail(1, viewer)).not.toBeNull();
        });

        it('refuses reads without view permission', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });

            await expect(s.appThumbnail(stranger)).rejects.toThrow(
                ForbiddenError,
            );
            await expect(s.versionThumbnail(1, stranger)).rejects.toThrow(
                ForbiddenError,
            );
        });

        it('refuses manual capture and remove without manage permission', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });

            await expect(
                s.thumbnails.setManualThumbnail(viewer, {
                    ...APP,
                    version: 1,
                    image: image('hand-picked state'),
                }),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                s.thumbnails.removeThumbnail(viewer, { ...APP, version: 1 }),
            ).rejects.toThrow(ForbiddenError);

            expect(await s.versionThumbnail(1)).toBe(
                `render of app-1 v1 as ${CREATOR_UUID}`,
            );
        });

        it('does not find an app through another project', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });

            await expect(
                s.appThumbnail(viewer, {
                    projectUuid: 'other-project',
                    appUuid: APP_UUID,
                }),
            ).rejects.toThrow(NotFoundError);
        });
    });
});
