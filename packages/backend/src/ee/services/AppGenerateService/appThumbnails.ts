import {
    NotFoundError,
    ParameterError,
    type AppVersionStatus,
    type SessionUser,
} from '@lightdash/common';

export type ThumbnailApp = {
    appUuid: string;
    projectUuid: string;
    organizationUuid: string;
    spaceUuid: string | null;
    createdByUserUuid: string;
    name: string;
    isCustomChartType: boolean;
};

export type ThumbnailVersion = {
    version: number;
    status: AppVersionStatus;
    createdByUserUuid: string;
    thumbnail: { isManual: boolean } | null;
};

export type AppVersionRef = { appUuid: string; version: number };

export type AppThumbnailVersionStore = {
    /** Throws when the app does not exist in the project. */
    getApp(appUuid: string, projectUuid: string): Promise<ThumbnailApp>;
    findAppByUuid(appUuid: string): Promise<ThumbnailApp | null>;
    findVersion(
        appUuid: string,
        version: number,
    ): Promise<ThumbnailVersion | null>;
    findLatestReadyVersion(appUuid: string): Promise<ThumbnailVersion | null>;
    hasAnyVersionThumbnail(appUuid: string): Promise<boolean>;
    /** A non-manual write never replaces a manual thumbnail; false when not written. */
    setThumbnail(
        appUuid: string,
        version: number,
        thumbnail: { isManual: boolean },
    ): Promise<boolean>;
    clearThumbnail(appUuid: string, version: number): Promise<void>;
};

export type AppThumbnailObjectStorage = {
    put(key: string, image: Buffer): Promise<void>;
    exists(key: string): Promise<boolean>;
    copy(fromKey: string, toKey: string): Promise<void>;
    /** Succeeds when the object does not exist. */
    delete(key: string): Promise<void>;
    getSignedUrl(key: string): Promise<string>;
};

export type AppThumbnailCapture = {
    /** False when no headless browser is configured. */
    isAvailable(): boolean;
    /** Renders one ready version as the given user; rejects when it cannot. */
    render(args: {
        app: ThumbnailApp;
        version: number;
        asUserUuid: string;
    }): Promise<Buffer>;
};

export type AppThumbnailSettings = {
    isAutomaticCaptureEnabled(organizationUuid: string): Promise<boolean>;
};

export type AppThumbnailAccess = {
    assertCanView(user: SessionUser, app: ThumbnailApp): Promise<void>;
    assertCanManage(user: SessionUser, app: ThumbnailApp): Promise<void>;
};

export type AppThumbnailsDeps = {
    versionStore: AppThumbnailVersionStore;
    objectStorage: AppThumbnailObjectStorage;
    capture: AppThumbnailCapture;
    settings: AppThumbnailSettings;
    access: AppThumbnailAccess;
};

export type AppThumbnailCaptureSkipReason =
    | 'no_headless_browser'
    | 'app_not_found'
    | 'custom_chart_type'
    | 'version_not_ready'
    | 'manual_thumbnail_exists';

export type AppThumbnailCaptureOutcome =
    | { status: 'captured' }
    | { status: 'skipped'; reason: AppThumbnailCaptureSkipReason }
    | { status: 'failed'; error: unknown };

type AppRef = { projectUuid: string; appUuid: string };

/** The single image an app had before versions got their own thumbnails. */
export const appLevelThumbnailKey = (appUuid: string): string =>
    `apps/${appUuid}/thumbnail.png`;

// Outside the version's bundle prefix, so copying a bundle never carries the
// image along. Manual and automatic images never share an object.
const versionThumbnailKey = (
    { appUuid, version }: AppVersionRef,
    isManual: boolean,
): string =>
    `apps/${appUuid}/thumbnails/${version}/${isManual ? 'manual' : 'automatic'}.png`;

/**
 * The thumbnail rules for data apps: every ready version has its own
 * thumbnail, and a data app's thumbnail is that of its latest ready version.
 */
export class AppThumbnails {
    private readonly versionStore: AppThumbnailVersionStore;

    private readonly objectStorage: AppThumbnailObjectStorage;

    private readonly capture: AppThumbnailCapture;

    private readonly settings: AppThumbnailSettings;

    private readonly access: AppThumbnailAccess;

    constructor({
        versionStore,
        objectStorage,
        capture,
        settings,
        access,
    }: AppThumbnailsDeps) {
        this.versionStore = versionStore;
        this.objectStorage = objectStorage;
        this.capture = capture;
        this.settings = settings;
        this.access = access;
    }

    /** Whether to enqueue a capture when a version of this app becomes ready. */
    async shouldCaptureAutomatically(
        app: Pick<ThumbnailApp, 'organizationUuid' | 'isCustomChartType'>,
    ): Promise<boolean> {
        if (this.uncapturableReason(app) !== null) return false;
        return this.settings.isAutomaticCaptureEnabled(app.organizationUuid);
    }

    /**
     * Captures a ready version's thumbnail, rendered as the version's creator.
     * Best-effort: never throws, and never replaces a manual thumbnail.
     */
    async captureVersion(
        ref: AppVersionRef,
    ): Promise<AppThumbnailCaptureOutcome> {
        try {
            const app = await this.versionStore.findAppByUuid(ref.appUuid);
            if (!app) return { status: 'skipped', reason: 'app_not_found' };

            const skipReason = this.uncapturableReason(app);
            if (skipReason) return { status: 'skipped', reason: skipReason };

            const version = await this.versionStore.findVersion(
                ref.appUuid,
                ref.version,
            );
            if (!version || version.status !== 'ready') {
                return { status: 'skipped', reason: 'version_not_ready' };
            }
            if (version.thumbnail?.isManual) {
                return { status: 'skipped', reason: 'manual_thumbnail_exists' };
            }

            const image = await this.capture.render({
                app,
                version: ref.version,
                asUserUuid: version.createdByUserUuid,
            });

            await this.objectStorage.put(
                versionThumbnailKey(ref, false),
                image,
            );
            const written = await this.versionStore.setThumbnail(
                ref.appUuid,
                ref.version,
                { isManual: false },
            );
            return written
                ? { status: 'captured' }
                : { status: 'skipped', reason: 'manual_thumbnail_exists' };
        } catch (error) {
            return { status: 'failed', error };
        }
    }

    // `version: null` targets the latest ready version. Returns the version written,
    // or null for a custom chart type, which keeps a single app-level image.
    async setManualThumbnail(
        user: SessionUser,
        {
            projectUuid,
            appUuid,
            version,
            image,
        }: AppRef & { version: number | null; image: Buffer },
    ): Promise<{ version: number | null }> {
        const app = await this.versionStore.getApp(appUuid, projectUuid);
        await this.access.assertCanManage(user, app);

        if (app.isCustomChartType) {
            await this.objectStorage.put(appLevelThumbnailKey(appUuid), image);
            return { version: null };
        }

        const target = await this.resolveTargetVersion(appUuid, version);
        if (!target) {
            throw new NotFoundError(
                'This app has no ready version to save a thumbnail for',
            );
        }
        const ref = { appUuid, version: target.version };
        await this.objectStorage.put(versionThumbnailKey(ref, true), image);
        await this.versionStore.setThumbnail(appUuid, target.version, {
            isManual: true,
        });
        await this.objectStorage.delete(versionThumbnailKey(ref, false));
        return { version: target.version };
    }

    /**
     * Removes a version's thumbnail and the old app-level image. `version: null`
     * targets the latest ready version. Idempotent.
     */
    async removeThumbnail(
        user: SessionUser,
        { projectUuid, appUuid, version }: AppRef & { version: number | null },
    ): Promise<void> {
        const app = await this.versionStore.getApp(appUuid, projectUuid);
        await this.access.assertCanManage(user, app);

        if (!app.isCustomChartType) {
            const target = await this.resolveTargetVersion(appUuid, version);
            if (target) {
                const ref = { appUuid, version: target.version };
                await this.versionStore.clearThumbnail(appUuid, target.version);
                await Promise.all([
                    this.objectStorage.delete(versionThumbnailKey(ref, true)),
                    this.objectStorage.delete(versionThumbnailKey(ref, false)),
                ]);
            }
        }
        await this.objectStorage.delete(appLevelThumbnailKey(appUuid));
    }

    /**
     * Gives `to` the thumbnail of `from`, if it has one. A copy is not a
     * capture, so it ignores the automatic capture setting. The caller is
     * responsible for authorizing the operation that needs the copy.
     */
    async copyThumbnail({
        from,
        to,
    }: {
        from: AppVersionRef;
        to: AppVersionRef;
    }): Promise<boolean> {
        const source = await this.versionStore.findVersion(
            from.appUuid,
            from.version,
        );
        if (!source?.thumbnail) return false;

        const { isManual } = source.thumbnail;
        await this.objectStorage.copy(
            versionThumbnailKey(from, isManual),
            versionThumbnailKey(to, isManual),
        );
        return this.versionStore.setThumbnail(to.appUuid, to.version, {
            isManual,
        });
    }

    /**
     * A data app's thumbnail: its latest ready version's, with no fallback to
     * older versions. Null when there is none.
     */
    async getAppThumbnailUrl(
        user: SessionUser,
        { projectUuid, appUuid }: AppRef,
    ): Promise<string | null> {
        const app = await this.versionStore.getApp(appUuid, projectUuid);
        await this.access.assertCanView(user, app);

        const key = await this.resolveAppThumbnailKey(app);
        return key ? this.objectStorage.getSignedUrl(key) : null;
    }

    /** One version's thumbnail. Null when the version has none. */
    async getVersionThumbnailUrl(
        user: SessionUser,
        { projectUuid, appUuid, version }: AppRef & { version: number },
    ): Promise<string | null> {
        const app = await this.versionStore.getApp(appUuid, projectUuid);
        await this.access.assertCanView(user, app);

        const row = await this.versionStore.findVersion(appUuid, version);
        const key = AppThumbnails.resolveVersionThumbnailKey(appUuid, row);
        return key ? this.objectStorage.getSignedUrl(key) : null;
    }

    /** Why this app's versions can never be captured; null when they can. */
    private uncapturableReason(
        app: Pick<ThumbnailApp, 'isCustomChartType'>,
    ): AppThumbnailCaptureSkipReason | null {
        if (!this.capture.isAvailable()) return 'no_headless_browser';
        if (app.isCustomChartType) return 'custom_chart_type';
        return null;
    }

    /** The version a manual action applies to; null when none is ready. */
    private async resolveTargetVersion(
        appUuid: string,
        version: number | null,
    ): Promise<ThumbnailVersion | null> {
        if (version === null) {
            return this.versionStore.findLatestReadyVersion(appUuid);
        }
        const row = await this.versionStore.findVersion(appUuid, version);
        if (!row) {
            throw new NotFoundError(`App version not found: v${version}`);
        }
        if (row.status !== 'ready') {
            throw new ParameterError(
                'Only a ready version can have a thumbnail',
            );
        }
        return row;
    }

    private static resolveVersionThumbnailKey(
        appUuid: string,
        version: ThumbnailVersion | null,
    ): string | null {
        if (!version?.thumbnail || version.status !== 'ready') return null;
        return versionThumbnailKey(
            { appUuid, version: version.version },
            version.thumbnail.isManual,
        );
    }

    private async resolveAppThumbnailKey(
        app: ThumbnailApp,
    ): Promise<string | null> {
        const appLevelKey = appLevelThumbnailKey(app.appUuid);
        if (!app.isCustomChartType) {
            const latestReady = await this.versionStore.findLatestReadyVersion(
                app.appUuid,
            );
            const versionKey = AppThumbnails.resolveVersionThumbnailKey(
                app.appUuid,
                latestReady,
            );
            if (versionKey) return versionKey;
            // The old image is only served while no version has a thumbnail.
            if (await this.versionStore.hasAnyVersionThumbnail(app.appUuid)) {
                return null;
            }
        }
        return (await this.objectStorage.exists(appLevelKey))
            ? appLevelKey
            : null;
    }
}
