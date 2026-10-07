import {
    CopyObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import {
    DATA_APP_VIZ_TEMPLATE,
    NotFoundError,
    ParameterError,
    resolveEffectiveOrganizationSettings,
    type AppVersionStatus,
} from '@lightdash/common';
import { createObjectUrlSigner } from '../../clients/Aws/ObjectUrlSigner';
import { type LightdashConfig } from '../../config/parseConfig';
import { type DbApp, type DbAppVersion } from '../../database/entities/apps';
import { type AppModel } from '../../models/AppModel';
import { type OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import { getOrganizationSettingsInstanceDefaults } from '../../services/OrganizationSettingsService/getInstanceDefaults';
import { type UnfurlService } from '../../services/UnfurlService/UnfurlService';
import {
    createAppRuntimeS3,
    type AppRuntimeS3,
} from '../services/AppGenerateService/s3Utils';

export type ThumbnailApp = {
    appUuid: string;
    projectUuid: string;
    organizationUuid: string;
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

/** The bucket that holds thumbnail images. */
export type AppThumbnailStorage = {
    put(key: string, image: Buffer): Promise<void>;
    exists(key: string): Promise<boolean>;
    copy(fromKey: string, toKey: string): Promise<void>;
    /** Succeeds when the object does not exist. */
    delete(key: string): Promise<void>;
    getSignedUrl(key: string): Promise<string>;
};

export type AppThumbnailClientArgs = {
    lightdashConfig: LightdashConfig;
    appModel: Pick<
        AppModel,
        | 'getApp'
        | 'findAppByUuid'
        | 'getVersion'
        | 'getLatestReadyVersion'
        | 'hasAnyVersionThumbnail'
        | 'setVersionThumbnail'
        | 'clearVersionThumbnail'
    >;
    unfurlService: Pick<UnfurlService, 'captureDataAppVersion'>;
    storage: AppThumbnailStorage;
    organizationSettingsModel: Pick<OrganizationSettingsModel, 'get'>;
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

const SIGNED_URL_TTL_SECONDS = 900;

const isObjectNotFound = (error: unknown): boolean =>
    error instanceof S3ServiceException &&
    error.$metadata.httpStatusCode === 404;

/** Thumbnail images in the data app runtime bucket. */
export class AppRuntimeThumbnailStorage implements AppThumbnailStorage {
    private readonly lightdashConfig: LightdashConfig;

    private s3: AppRuntimeS3 | null = null;

    constructor({ lightdashConfig }: { lightdashConfig: LightdashConfig }) {
        this.lightdashConfig = lightdashConfig;
    }

    // Built on first use, so an instance without app runtime S3 still starts.
    private getS3(): AppRuntimeS3 {
        this.s3 = this.s3 ?? createAppRuntimeS3(this.lightdashConfig);
        return this.s3;
    }

    async put(key: string, image: Buffer): Promise<void> {
        const { client, bucket } = this.getS3();
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: image,
                ContentLength: image.length,
                ContentType: 'image/png',
            }),
        );
    }

    async exists(key: string): Promise<boolean> {
        const { client, bucket } = this.getS3();
        try {
            await client.send(
                new HeadObjectCommand({ Bucket: bucket, Key: key }),
            );
            return true;
        } catch (error) {
            if (isObjectNotFound(error)) return false;
            throw error;
        }
    }

    async copy(fromKey: string, toKey: string): Promise<void> {
        const { client, bucket } = this.getS3();
        await client.send(
            new CopyObjectCommand({
                Bucket: bucket,
                CopySource: `/${bucket}/${fromKey}`,
                Key: toKey,
            }),
        );
    }

    // GCS answers a delete of a missing object with 404, unlike S3.
    async delete(key: string): Promise<void> {
        const { client, bucket } = this.getS3();
        try {
            await client.send(
                new DeleteObjectCommand({ Bucket: bucket, Key: key }),
            );
        } catch (error) {
            if (isObjectNotFound(error)) return;
            throw error;
        }
    }

    async getSignedUrl(key: string): Promise<string> {
        const { client, bucket } = this.getS3();
        return createObjectUrlSigner(
            client,
            this.lightdashConfig.appRuntime.s3 ?? {},
        ).getSignedDownloadUrl(bucket, key, SIGNED_URL_TTL_SECONDS);
    }
}

const toThumbnailApp = (
    app: DbApp & { organization_uuid: string },
): ThumbnailApp => ({
    appUuid: app.app_id,
    projectUuid: app.project_uuid,
    organizationUuid: app.organization_uuid,
    name: app.name,
    isCustomChartType: app.template === DATA_APP_VIZ_TEMPLATE,
});

const toThumbnailVersion = (
    row: DbAppVersion | null,
): ThumbnailVersion | null => {
    if (!row) return null;
    return {
        version: row.version,
        status: row.status,
        createdByUserUuid: row.created_by_user_uuid,
        thumbnail: row.thumbnail_captured_at
            ? { isManual: row.thumbnail_is_manual === true }
            : null,
    };
};

/**
 * The thumbnail rules for data apps: every ready version has its own
 * thumbnail, and a data app's thumbnail is that of its latest ready version.
 * Does no authorization: callers check access to the app first.
 */
export class AppThumbnailClient {
    private readonly lightdashConfig: LightdashConfig;

    private readonly appModel: AppThumbnailClientArgs['appModel'];

    private readonly unfurlService: AppThumbnailClientArgs['unfurlService'];

    private readonly storage: AppThumbnailStorage;

    private readonly organizationSettingsModel: AppThumbnailClientArgs['organizationSettingsModel'];

    constructor({
        lightdashConfig,
        appModel,
        unfurlService,
        storage,
        organizationSettingsModel,
    }: AppThumbnailClientArgs) {
        this.lightdashConfig = lightdashConfig;
        this.appModel = appModel;
        this.unfurlService = unfurlService;
        this.storage = storage;
        this.organizationSettingsModel = organizationSettingsModel;
    }

    /** Whether to enqueue a capture when a version of this app becomes ready. */
    async shouldCaptureAutomatically(
        app: Pick<ThumbnailApp, 'organizationUuid' | 'isCustomChartType'>,
    ): Promise<boolean> {
        if (this.uncapturableReason(app) !== null) return false;
        const settings = resolveEffectiveOrganizationSettings(
            await this.organizationSettingsModel.get(app.organizationUuid),
            getOrganizationSettingsInstanceDefaults(this.lightdashConfig),
        );
        return settings.dataAppAutomaticThumbnailsEnabled !== false;
    }

    /**
     * Captures a ready version's thumbnail, rendered as the version's creator.
     * Best-effort: never throws, and never replaces a manual thumbnail.
     */
    async captureVersion(
        ref: AppVersionRef,
    ): Promise<AppThumbnailCaptureOutcome> {
        try {
            const appRow = await this.appModel.findAppByUuid(ref.appUuid);
            if (!appRow) return { status: 'skipped', reason: 'app_not_found' };
            const app = toThumbnailApp(appRow);

            const skipReason = this.uncapturableReason(app);
            if (skipReason) return { status: 'skipped', reason: skipReason };

            const version = await this.findVersion(ref.appUuid, ref.version);
            if (!version || version.status !== 'ready') {
                return { status: 'skipped', reason: 'version_not_ready' };
            }
            if (version.thumbnail?.isManual) {
                return { status: 'skipped', reason: 'manual_thumbnail_exists' };
            }

            const image = await this.unfurlService.captureDataAppVersion({
                projectUuid: app.projectUuid,
                appUuid: app.appUuid,
                appName: app.name,
                version: ref.version,
                authUserUuid: version.createdByUserUuid,
                organizationUuid: app.organizationUuid,
            });

            await this.storage.put(versionThumbnailKey(ref, false), image);
            const written = await this.appModel.setVersionThumbnail(
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
    async setManualThumbnail({
        projectUuid,
        appUuid,
        version,
        image,
    }: AppRef & { version: number | null; image: Buffer }): Promise<{
        version: number | null;
    }> {
        const app = await this.getApp(appUuid, projectUuid);

        if (app.isCustomChartType) {
            await this.storage.put(appLevelThumbnailKey(appUuid), image);
            return { version: null };
        }

        const target = await this.resolveTargetVersion(appUuid, version);
        if (!target) {
            throw new NotFoundError(
                'This app has no ready version to save a thumbnail for',
            );
        }
        const ref = { appUuid, version: target.version };
        await this.storage.put(versionThumbnailKey(ref, true), image);
        await this.appModel.setVersionThumbnail(appUuid, target.version, {
            isManual: true,
        });
        await this.storage.delete(versionThumbnailKey(ref, false));
        return { version: target.version };
    }

    /**
     * Removes a version's thumbnail and the old app-level image. `version: null`
     * targets the latest ready version. Idempotent.
     */
    async removeThumbnail({
        projectUuid,
        appUuid,
        version,
    }: AppRef & { version: number | null }): Promise<void> {
        const app = await this.getApp(appUuid, projectUuid);

        if (!app.isCustomChartType) {
            const target = await this.resolveTargetVersion(appUuid, version);
            if (target) {
                const ref = { appUuid, version: target.version };
                await this.appModel.clearVersionThumbnail(
                    appUuid,
                    target.version,
                );
                await Promise.all([
                    this.storage.delete(versionThumbnailKey(ref, true)),
                    this.storage.delete(versionThumbnailKey(ref, false)),
                ]);
            }
        }
        await this.storage.delete(appLevelThumbnailKey(appUuid));
    }

    // Gives `to` the thumbnail of `from`, if it has one; not a capture, so the
    // automatic capture setting does not apply.
    async copyThumbnail({
        from,
        to,
    }: {
        from: AppVersionRef;
        to: AppVersionRef;
    }): Promise<boolean> {
        const source = await this.findVersion(from.appUuid, from.version);
        if (!source?.thumbnail) return false;

        const { isManual } = source.thumbnail;
        await this.storage.copy(
            versionThumbnailKey(from, isManual),
            versionThumbnailKey(to, isManual),
        );
        return this.appModel.setVersionThumbnail(to.appUuid, to.version, {
            isManual,
        });
    }

    /**
     * A data app's thumbnail: its latest ready version's, with no fallback to
     * older versions. Null when there is none.
     */
    async getAppThumbnailUrl({
        projectUuid,
        appUuid,
    }: AppRef): Promise<string | null> {
        const app = await this.getApp(appUuid, projectUuid);
        const key = await this.resolveAppThumbnailKey(app);
        return key ? this.storage.getSignedUrl(key) : null;
    }

    /** One version's thumbnail. Null when the version has none. */
    async getVersionThumbnailUrl({
        projectUuid,
        appUuid,
        version,
    }: AppRef & { version: number }): Promise<string | null> {
        await this.getApp(appUuid, projectUuid);
        const row = await this.findVersion(appUuid, version);
        const key = AppThumbnailClient.resolveVersionThumbnailKey(appUuid, row);
        return key ? this.storage.getSignedUrl(key) : null;
    }

    /** Throws when the app does not exist in the project. */
    private async getApp(
        appUuid: string,
        projectUuid: string,
    ): Promise<ThumbnailApp> {
        return toThumbnailApp(await this.appModel.getApp(appUuid, projectUuid));
    }

    private async findVersion(
        appUuid: string,
        version: number,
    ): Promise<ThumbnailVersion | null> {
        return toThumbnailVersion(
            await this.appModel.getVersion(appUuid, version),
        );
    }

    /** Why this app's versions can never be captured; null when they can. */
    private uncapturableReason(
        app: Pick<ThumbnailApp, 'isCustomChartType'>,
    ): AppThumbnailCaptureSkipReason | null {
        if (this.lightdashConfig.headlessBrowser.host === undefined) {
            return 'no_headless_browser';
        }
        if (app.isCustomChartType) return 'custom_chart_type';
        return null;
    }

    /** The version a manual action applies to; null when none is ready. */
    private async resolveTargetVersion(
        appUuid: string,
        version: number | null,
    ): Promise<ThumbnailVersion | null> {
        if (version === null) {
            return toThumbnailVersion(
                await this.appModel.getLatestReadyVersion(appUuid),
            );
        }
        const row = await this.findVersion(appUuid, version);
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
            const latestReady = toThumbnailVersion(
                await this.appModel.getLatestReadyVersion(app.appUuid),
            );
            const versionKey = AppThumbnailClient.resolveVersionThumbnailKey(
                app.appUuid,
                latestReady,
            );
            if (versionKey) return versionKey;
            // The old image is only served while no version has a thumbnail.
            if (await this.appModel.hasAnyVersionThumbnail(app.appUuid)) {
                return null;
            }
        }
        return (await this.storage.exists(appLevelKey)) ? appLevelKey : null;
    }
}
