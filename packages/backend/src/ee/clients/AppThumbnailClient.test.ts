import { NotFoundError, type AppVersionStatus } from '@lightdash/common';
import { type DbAppVersion } from '../../database/entities/apps';
import {
    appLevelThumbnailKey,
    type AppThumbnailClientArgs,
} from './AppThumbnailClient';
import {
    buildAppThumbnailClientMock,
    createInMemoryAppThumbnailStorage,
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
        setVersionThumbnail: async (appUuid, version) => {
            const row = findRow(appUuid, version);
            if (!row) return false;
            row.thumbnail_captured_at = new Date();
            row.thumbnail_is_manual = true;
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
        // The organization's stored captures switch; null when never changed.
        capturesEnabled: null as boolean | null,
    };

    const thumbnails = buildAppThumbnailClientMock({
        appModel,
        storage,
        organizationSettingsModel: organizationSettingsModelWith(
            () => state.capturesEnabled,
        ),
    });

    if (legacyImage) {
        objects.set(appLevelThumbnailKey(APP_UUID), legacyImage);
    }

    return {
        thumbnails,
        state,
        objects,
        addVersion,
        setManual: (version: number | null, label: string, app = APP) =>
            thumbnails.setManualThumbnail({
                ...app,
                version,
                image: image(label),
            }),
        /**
         * A version captured by the removed automatic capture: the row and
         * the `automatic.png` object an older release left behind.
         */
        seedAutomaticThumbnail: (version: number, appUuid = APP_UUID) => {
            const row = findRow(appUuid, version);
            if (!row) throw new Error(`No such version: v${version}`);
            row.thumbnail_captured_at = new Date();
            row.thumbnail_is_manual = false;
            objects.set(
                `apps/${appUuid}/thumbnails/${version}/automatic.png`,
                image(`automatic capture of ${appUuid} v${version}`),
            );
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
    describe('thumbnails captured automatically by an older release', () => {
        it('are not served for the version', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            s.seedAutomaticThumbnail(1);

            expect(await s.versionThumbnail(1)).toBeNull();
        });

        it('leave the app with no thumbnail, not even the old app-level image', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
                legacyImage: image('old app-level image'),
            });
            s.seedAutomaticThumbnail(1);

            expect(await s.appThumbnail()).toBeNull();
        });

        it('are replaced by a manual thumbnail', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            s.seedAutomaticThumbnail(1);

            await s.setManual(1, 'hand-picked state');

            expect(await s.versionThumbnail(1)).toBe('hand-picked state');
            expect(await s.appThumbnail()).toBe('hand-picked state');
        });

        it('are not copied to another version', async () => {
            const s = buildScenario({
                versions: [
                    { version: 1, status: 'ready' },
                    { version: 2, status: 'ready' },
                ],
            });
            s.seedAutomaticThumbnail(1);

            const copied = await s.thumbnails.copyThumbnail({
                from: { appUuid: APP_UUID, version: 1 },
                to: { appUuid: APP_UUID, version: 2 },
            });

            expect(copied).toBe(false);
            expect(await s.versionThumbnail(2)).toBeNull();
        });
    });

    describe('the organization captures switch', () => {
        it('is on until the organization turns it off', async () => {
            const s = buildScenario();

            expect(await s.thumbnails.areCapturesEnabled('org-1')).toBe(true);

            s.state.capturesEnabled = false;
            expect(await s.thumbnails.areCapturesEnabled('org-1')).toBe(false);
        });

        it('cannot be turned on past the instance env', async () => {
            const client = buildAppThumbnailClientMock({
                capturesEnabledOnInstance: false,
                organizationSettingsModel: organizationSettingsModelWith(
                    () => true,
                ),
            });

            expect(await client.areCapturesEnabled('org-1')).toBe(false);
        });
    });

    describe("a data app's thumbnail", () => {
        it("is its latest ready version's thumbnail", async () => {
            const s = buildScenario({
                versions: [
                    { version: 1, status: 'ready' },
                    { version: 2, status: 'ready' },
                ],
            });

            await s.setManual(1, 'v1 state');
            await s.setManual(2, 'v2 state');

            expect(await s.appThumbnail()).toBe('v2 state');
        });

        it('is not changed by a newer version that is building or failed', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            await s.setManual(1, 'v1 state');

            s.addVersion({ version: 2, status: 'error' });
            s.addVersion({ version: 3, status: 'building' });

            expect(await s.appThumbnail()).toBe('v1 state');
        });

        it('is none when the latest ready version has none, even if older versions have one', async () => {
            const s = buildScenario({
                versions: [
                    { version: 1, status: 'ready' },
                    { version: 2, status: 'ready' },
                ],
            });
            await s.setManual(1, 'v1 state');

            expect(await s.versionThumbnail(1)).toBe('v1 state');
            expect(await s.appThumbnail()).toBeNull();
        });

        it('is the old app-level image only while no version has a thumbnail', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
                legacyImage: image('old app-level image'),
            });
            expect(await s.appThumbnail()).toBe('old app-level image');

            await s.setManual(1, 'v1 state');
            expect(await s.appThumbnail()).toBe('v1 state');

            // v2 has no thumbnail, but v1 does: the old image stays ignored.
            s.addVersion({ version: 2, status: 'ready' });
            expect(await s.appThumbnail()).toBeNull();
        });

        it('stays the app-level image for a custom chart type', async () => {
            const s = buildScenario({
                apps: [{ isCustomChartType: true }],
                versions: [{ version: 1, status: 'ready' }],
            });

            await s.setManual(null, 'chart type image');

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
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            await s.setManual(1, 'first state');

            await s.setManual(1, 'hand-picked state');

            expect(await s.versionThumbnail(1)).toBe('hand-picked state');
            expect(await s.appThumbnail()).toBe('hand-picked state');
        });

        it('targets the version being viewed, not the latest', async () => {
            const s = buildScenario({
                versions: [
                    { version: 1, status: 'ready' },
                    { version: 2, status: 'ready' },
                ],
            });

            await s.setManual(1, 'hand-picked state');

            expect(await s.versionThumbnail(1)).toBe('hand-picked state');
            expect(await s.versionThumbnail(2)).toBeNull();
        });

        it('targets the latest ready version when no version is given', async () => {
            const s = buildScenario({
                versions: [
                    { version: 1, status: 'ready' },
                    { version: 2, status: 'ready' },
                    { version: 3, status: 'building' },
                ],
            });

            const saved = await s.setManual(null, 'hand-picked state');

            expect(saved.version).toBe(2);
            expect(await s.versionThumbnail(2)).toBe('hand-picked state');
            expect(await s.versionThumbnail(1)).toBeNull();
        });

        it('is refused for a version that is not ready', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'building' }],
            });

            await expect(s.setManual(1, 'hand-picked state')).rejects.toThrow();
            await expect(s.setManual(7, 'hand-picked state')).rejects.toThrow(
                NotFoundError,
            );
            expect(await s.versionThumbnail(1)).toBeNull();
        });

        it('is saved while the captures switch is off', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            s.state.capturesEnabled = false;

            await s.setManual(1, 'hand-picked state');

            expect(await s.versionThumbnail(1)).toBe('hand-picked state');
        });
    });

    describe('remove', () => {
        it("deletes the version's thumbnail and the old app-level image", async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
                legacyImage: image('old app-level image'),
            });
            await s.setManual(1, 'hand-picked state');

            await s.thumbnails.removeThumbnail({
                ...APP,
                version: 1,
            });

            expect(await s.versionThumbnail(1)).toBeNull();
            expect(await s.appThumbnail()).toBeNull();
            expect(s.objects.has(appLevelThumbnailKey(APP_UUID))).toBe(false);
        });

        it('deletes the thumbnail of the latest ready version when no version is given', async () => {
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            await s.setManual(1, 'hand-picked state');

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
    });

    describe('copy between versions', () => {
        it("gives a restored version the source version's thumbnail", async () => {
            const s = buildScenario({
                versions: [
                    { version: 1, status: 'ready' },
                    { version: 2, status: 'ready' },
                ],
            });
            await s.setManual(1, 'v1 state');

            s.addVersion({ version: 3, status: 'ready' });
            await s.thumbnails.copyThumbnail({
                from: { appUuid: APP_UUID, version: 1 },
                to: { appUuid: APP_UUID, version: 3 },
            });

            expect(await s.versionThumbnail(3)).toBe('v1 state');
            expect(await s.appThumbnail()).toBe('v1 state');
        });

        it("gives a duplicate's first version the source version's thumbnail, even with captures off", async () => {
            const s = buildScenario({
                apps: [{}, { appUuid: 'app-copy' }],
                versions: [{ version: 4, status: 'ready' }],
            });
            await s.setManual(4, 'hand-picked state');
            s.state.capturesEnabled = false;

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
            const s = buildScenario({
                versions: [{ version: 1, status: 'ready' }],
            });
            await s.setManual(1, 'hand-picked state');

            await expect(
                s.appThumbnail({
                    projectUuid: 'other-project',
                    appUuid: APP_UUID,
                }),
            ).rejects.toThrow(NotFoundError);
        });
    });
});
