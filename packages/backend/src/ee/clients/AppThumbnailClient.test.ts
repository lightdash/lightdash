import { NotFoundError, type AppVersionStatus } from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type DbAppVersion } from '../../database/entities/apps';
import {
    appLevelThumbnailKey,
    AppThumbnailClient,
    type AppThumbnailClientArgs,
} from './AppThumbnailClient';
import {
    buildAppThumbnailClientMock,
    createInMemoryAppThumbnailStorage,
    featureFlagModelWith,
    organizationSettingsModelWith,
} from './AppThumbnailClient.mock';

const APP_UUID = 'app-1';
const PROJECT_UUID = 'project-1';
const ORGANIZATION_UUID = 'org-1';
const CREATOR_UUID = 'creator-1';
const APP = { projectUuid: PROJECT_UUID, appUuid: APP_UUID };

const image = (label: string) => Buffer.from(label);

type AppModelFake = AppThumbnailClientArgs['appModel'];
type AppRow = Awaited<ReturnType<AppModelFake['getApp']>>;
type VersionRow = NonNullable<Awaited<ReturnType<AppModelFake['getVersion']>>>;

type AppSeed = { appUuid?: string; isCustomChartType?: boolean };
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
    const appRows = new Map<string, AppRow>(
        apps.map((seed) => {
            const row = {
                app_id: seed.appUuid ?? APP_UUID,
                project_uuid: PROJECT_UUID,
                organization_uuid: ORGANIZATION_UUID,
                space_uuid: null,
                created_by_user_uuid: CREATOR_UUID,
                name: 'Revenue app',
                template: seed.isCustomChartType ? 'data_app_viz' : 'dashboard',
            } as AppRow;
            return [row.app_id, row];
        }),
    );
    const versionRows: VersionRow[] = [];
    const versionsOf = (appUuid: string) =>
        versionRows.filter((row) => row.app_id === appUuid);
    const addVersion = (seed: VersionSeed) => {
        versionRows.push({
            app_id: seed.appUuid ?? APP_UUID,
            version: seed.version,
            status: seed.status,
            created_by_user_uuid: seed.createdByUserUuid ?? CREATOR_UUID,
            thumbnail_captured_at: null,
            thumbnail_is_manual: null,
        } as Partial<DbAppVersion> as VersionRow);
    };
    versions.forEach(addVersion);
    const findRow = (appUuid: string, version: number) =>
        versionsOf(appUuid).find((row) => row.version === version) ?? null;

    const appModel: AppModelFake = {
        getApp: async (appUuid, projectUuid) => {
            const app = appRows.get(appUuid);
            if (!app || app.project_uuid !== projectUuid) {
                throw new NotFoundError(`App not found: ${appUuid}`);
            }
            return app;
        },
        findAppByUuid: async (appUuid) => appRows.get(appUuid),
        getVersion: async (appUuid, version) => {
            const row = findRow(appUuid, version);
            return row ? { ...row } : null;
        },
        getLatestReadyVersion: async (appUuid) => {
            const ready = versionsOf(appUuid)
                .filter((row) => row.status === 'ready')
                .sort((a, b) => b.version - a.version);
            return ready.length > 0 ? { ...ready[0] } : null;
        },
        hasAnyVersionThumbnail: async (appUuid) =>
            versionsOf(appUuid).some(
                (row) => row.thumbnail_captured_at !== null,
            ),
        setVersionThumbnail: async (appUuid, version, { isManual }) => {
            const row = findRow(appUuid, version);
            if (!row) return false;
            if (!isManual && row.thumbnail_is_manual) return false;
            row.thumbnail_captured_at = new Date();
            row.thumbnail_is_manual = isManual;
            return true;
        },
        clearVersionThumbnail: async (appUuid, version) => {
            const row = findRow(appUuid, version);
            if (!row) return;
            row.thumbnail_captured_at = null;
            row.thumbnail_is_manual = null;
        },
    };

    const { storage, objects, download } = createInMemoryAppThumbnailStorage();

    const state = {
        // The organization's stored choice; null when it never changed it.
        automaticCaptureEnabled: null as boolean | null,
        featureFlagEnabled: true,
        renderFails: false,
        // Runs while the headless render is in flight.
        duringRender: async () => {},
    };
    const lightdashConfig = {
        ...lightdashConfigMock,
        headlessBrowser: {
            ...lightdashConfigMock.headlessBrowser,
            host: 'headless-browser' as string | undefined,
        },
    };

    const thumbnails = new AppThumbnailClient({
        lightdashConfig,
        appModel,
        unfurlService: {
            captureDataAppVersion: async ({
                appUuid,
                version,
                authUserUuid,
            }) => {
                await state.duringRender();
                if (state.renderFails) throw new Error('Render timed out');
                return image(
                    `render of ${appUuid} v${version} as ${authUserUuid}`,
                );
            },
        },
        storage,
        organizationSettingsModel: organizationSettingsModelWith(
            () => state.automaticCaptureEnabled,
        ),
        featureFlagModel: featureFlagModelWith(() => state.featureFlagEnabled),
    });

    if (legacyImage) {
        objects.set(appLevelThumbnailKey(APP_UUID), legacyImage);
    }

    return {
        thumbnails,
        state,
        addVersion,
        removeHeadlessBrowser: () => {
            lightdashConfig.headlessBrowser.host = undefined;
        },
        statusOf: (version: number, appUuid = APP_UUID) =>
            findRow(appUuid, version)?.status ?? null,
        /** A build finished: the version is ready, and its capture job runs if one is enqueued. */
        becomeReady: async (seed: Omit<VersionSeed, 'status'>) => {
            const appUuid = seed.appUuid ?? APP_UUID;
            addVersion({ ...seed, status: 'ready' });
            const app = appRows.get(appUuid);
            if (!app) throw new Error(`No such app: ${appUuid}`);
            const shouldCapture = await thumbnails.shouldCaptureAutomatically({
                organizationUuid: app.organization_uuid,
                isCustomChartType: app.template === 'data_app_viz',
            });
            if (shouldCapture) {
                await thumbnails.captureVersion({
                    appUuid,
                    version: seed.version,
                });
            }
        },
        appThumbnail: async (app = APP) =>
            download(await thumbnails.getAppThumbnailUrl(app)),
        versionThumbnail: async (version: number, app = APP) =>
            download(
                await thumbnails.getVersionThumbnailUrl({ ...app, version }),
            ),
    };
};

describe('AppThumbnailClient', () => {
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

        it('captures nothing when no headless browser is configured', async () => {
            const s = buildScenario();
            s.removeHeadlessBrowser();

            await s.becomeReady({ version: 1 });
            const outcome = await s.thumbnails.captureVersion({
                appUuid: APP_UUID,
                version: 1,
            });

            expect(outcome.status).toBe('skipped');
            expect(await s.versionThumbnail(1)).toBeNull();
        });

        it('captures nothing for a custom chart type', async () => {
            const s = buildScenario({ apps: [{ isCustomChartType: true }] });

            await s.becomeReady({ version: 1 });
            const outcome = await s.thumbnails.captureVersion({
                appUuid: APP_UUID,
                version: 1,
            });

            expect(outcome.status).toBe('skipped');
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

    describe('with automatic capture turned off for the organization', () => {
        it('is on for an organization that has never changed the setting', async () => {
            const s = buildScenario();

            await s.becomeReady({ version: 1 });

            expect(await s.versionThumbnail(1)).toBe(
                `render of app-1 v1 as ${CREATOR_UUID}`,
            );
        });

        it('is off only for the organization that turned it off', async () => {
            const stored: Record<string, boolean> = {
                'org-1': false,
                'org-2': true,
            };
            const client = buildAppThumbnailClientMock({
                headlessBrowserConfigured: true,
                organizationSettingsModel: organizationSettingsModelWith(
                    (organizationUuid) => stored[organizationUuid] ?? null,
                ),
            });
            const capturesFor = (organizationUuid: string) =>
                client.shouldCaptureAutomatically({
                    organizationUuid,
                    isCustomChartType: false,
                });

            expect(await capturesFor('org-1')).toBe(false);
            expect(await capturesFor('org-2')).toBe(true);
            expect(await capturesFor('org-3')).toBe(true);
        });

        it('captures nothing when a version becomes ready', async () => {
            const s = buildScenario();
            s.state.automaticCaptureEnabled = false;

            await s.becomeReady({ version: 1 });

            expect(await s.versionThumbnail(1)).toBeNull();
        });

        it('still captures a version whose capture was enqueued before it was turned off', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            s.state.automaticCaptureEnabled = false;

            await s.thumbnails.captureVersion({
                appUuid: APP_UUID,
                version: 1,
            });

            expect(await s.versionThumbnail(1)).toBe(
                `render of app-1 v1 as ${CREATOR_UUID}`,
            );
        });

        it('still saves a manual capture', async () => {
            const s = buildScenario();
            s.state.automaticCaptureEnabled = false;
            await s.becomeReady({ version: 1 });

            await s.thumbnails.setManualThumbnail({
                ...APP,
                version: 1,
                image: image('hand-picked state'),
            });

            expect(await s.versionThumbnail(1)).toBe('hand-picked state');
            expect(await s.appThumbnail()).toBe('hand-picked state');
        });

        it('keeps showing the thumbnails captured before it was turned off', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });

            s.state.automaticCaptureEnabled = false;

            expect(await s.versionThumbnail(1)).toBe(
                `render of app-1 v1 as ${CREATOR_UUID}`,
            );
            expect(await s.appThumbnail()).toBe(
                `render of app-1 v1 as ${CREATOR_UUID}`,
            );
        });

        it('captures only the versions that become ready after it is turned back on', async () => {
            const s = buildScenario();
            s.state.automaticCaptureEnabled = false;
            await s.becomeReady({ version: 1 });

            s.state.automaticCaptureEnabled = true;
            await s.becomeReady({ version: 2 });

            expect(await s.versionThumbnail(1)).toBeNull();
            expect(await s.versionThumbnail(2)).toBe(
                `render of app-1 v2 as ${CREATOR_UUID}`,
            );
        });
    });

    describe('with the automatic thumbnails feature flag off for the organization', () => {
        it('captures nothing when a version becomes ready', async () => {
            const s = buildScenario();
            s.state.featureFlagEnabled = false;
            s.state.automaticCaptureEnabled = true;

            await s.becomeReady({ version: 1 });

            expect(await s.versionThumbnail(1)).toBeNull();
        });

        it('skips a capture that was already enqueued', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            s.state.featureFlagEnabled = false;

            const outcome = await s.thumbnails.captureVersion({
                appUuid: APP_UUID,
                version: 1,
            });

            expect(outcome).toEqual({
                status: 'skipped',
                reason: 'feature_flag_off',
            });
            expect(await s.versionThumbnail(1)).toBeNull();
        });

        it('is off only for the organization without the flag', async () => {
            const client = buildAppThumbnailClientMock({
                headlessBrowserConfigured: true,
                featureFlagModel: featureFlagModelWith(
                    (organizationUuid) => organizationUuid === 'org-2',
                ),
            });
            const capturesFor = (organizationUuid: string) =>
                client.shouldCaptureAutomatically({
                    organizationUuid,
                    isCustomChartType: false,
                });

            expect(await capturesFor('org-1')).toBe(false);
            expect(await capturesFor('org-2')).toBe(true);
        });

        it('still saves a manual capture', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            s.state.featureFlagEnabled = false;

            await s.thumbnails.setManualThumbnail({
                ...APP,
                version: 1,
                image: image('hand-picked state'),
            });

            expect(await s.versionThumbnail(1)).toBe('hand-picked state');
        });

        it('stores exactly the rendered image once the flag is on', async () => {
            const s = buildScenario();
            s.state.featureFlagEnabled = true;
            s.state.automaticCaptureEnabled = true;

            await s.becomeReady({ version: 1, createdByUserUuid: 'ada' });

            expect(await s.versionThumbnail(1)).toBe(
                'render of app-1 v1 as ada',
            );
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

            await s.thumbnails.setManualThumbnail({
                ...APP,
                version: null,
                image: image('chart type image'),
            });

            expect(await s.appThumbnail()).toBe('chart type image');
            expect(await s.versionThumbnail(1)).toBeNull();

            await s.thumbnails.removeThumbnail({
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

            await s.thumbnails.setManualThumbnail({
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

            await s.thumbnails.setManualThumbnail({
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

            const saved = await s.thumbnails.setManualThumbnail({
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
                s.thumbnails.setManualThumbnail({
                    ...APP,
                    version: 1,
                    image: image('hand-picked state'),
                }),
            ).rejects.toThrow();
            await expect(
                s.thumbnails.setManualThumbnail({
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
            await s.thumbnails.setManualThumbnail({
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
                await s.thumbnails.setManualThumbnail({
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

            await s.thumbnails.removeThumbnail({
                ...APP,
                version: 1,
            });

            expect(await s.versionThumbnail(1)).toBeNull();
            expect(await s.appThumbnail()).toBeNull();
        });

        it('deletes a manual thumbnail', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });
            await s.thumbnails.setManualThumbnail({
                ...APP,
                version: 1,
                image: image('hand-picked state'),
            });

            await s.thumbnails.removeThumbnail({
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

            await s.thumbnails.removeThumbnail({
                ...APP,
                version: null,
            });

            expect(await s.appThumbnail()).toBeNull();
        });

        it('is not sticky: the next version is still captured', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });
            await s.thumbnails.removeThumbnail({
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
            await s.thumbnails.setManualThumbnail({
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
            expect(await s.versionThumbnail(1, copy)).toBe('hand-picked state');
            expect(await s.appThumbnail(copy)).toBe('hand-picked state');
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

    describe('lookup', () => {
        it('does not find an app through another project', async () => {
            const s = buildScenario();
            await s.becomeReady({ version: 1 });

            await expect(
                s.appThumbnail({
                    projectUuid: 'other-project',
                    appUuid: APP_UUID,
                }),
            ).rejects.toThrow(NotFoundError);
        });
    });
});
