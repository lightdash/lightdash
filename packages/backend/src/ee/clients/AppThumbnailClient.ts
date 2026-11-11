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
    hasThumbnail: boolean;
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
        | 'getVersion'
        | 'getLatestReadyVersion'
        | 'hasAnyVersionThumbnail'
        | 'setVersionThumbnail'
        | 'clearVersionThumbnail'
    >;
    storage: AppThumbnailStorage;
    organizationSettingsModel: Pick<OrganizationSettingsModel, 'get'>;
};

type AppRef = { projectUuid: string; appUuid: string };

/** The single image an app had before versions got their own thumbnails. */
export const appLevelThumbnailKey = (appUuid: string): string =>
    `apps/${appUuid}/thumbnail.png`;

// Outside the version's bundle prefix, so copying a bundle never carries the
// image along.
const versionThumbnailKey = ({ appUuid, version }: AppVersionRef): string =>
    `apps/${appUuid}/thumbnails/${version}/manual.png`;

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

// Only a manual thumbnail counts. Rows written by the removed automatic
// capture (`thumbnail_is_manual` false) read as having no thumbnail.
const toThumbnailVersion = (
    row: DbAppVersion | null,
): ThumbnailVersion | null => {
    if (!row) return null;
    return {
        version: row.version,
        status: row.status,
        hasThumbnail:
            row.thumbnail_captured_at !== null &&
            row.thumbnail_is_manual === true,
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

    private readonly storage: AppThumbnailStorage;

    private readonly organizationSettingsModel: AppThumbnailClientArgs['organizationSettingsModel'];

    constructor({
        lightdashConfig,
        appModel,
        storage,
        organizationSettingsModel,
    }: AppThumbnailClientArgs) {
        this.lightdashConfig = lightdashConfig;
        this.appModel = appModel;
        this.storage = storage;
        this.organizationSettingsModel = organizationSettingsModel;
    }

    private async effectiveSettings(organizationUuid: string) {
        return resolveEffectiveOrganizationSettings(
            await this.organizationSettingsModel.get(organizationUuid),
            getOrganizationSettingsInstanceDefaults(this.lightdashConfig),
        );
    }

    /**
     * The org's effective "allow screenshots and attachments in data app
     * builds" switch: the org setting capped by `LIGHTDASH_APP_CAPTURES_ENABLED`.
     * Every capture of a running app — prompt-bar screenshots, file
     * attachments, manual thumbnails, the Slack build-outcome image — checks
     * this before it runs.
     */
    async areCapturesEnabled(organizationUuid: string): Promise<boolean> {
        // Resolved to a boolean by the resolver; the type stays nullable.
        return (
            (await this.effectiveSettings(organizationUuid))
                .dataAppCapturesEnabled !== false
        );
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
        await this.storage.put(
            versionThumbnailKey({ appUuid, version: target.version }),
            image,
        );
        await this.appModel.setVersionThumbnail(appUuid, target.version);
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
                await this.appModel.clearVersionThumbnail(
                    appUuid,
                    target.version,
                );
                await this.storage.delete(
                    versionThumbnailKey({ appUuid, version: target.version }),
                );
            }
        }
        await this.storage.delete(appLevelThumbnailKey(appUuid));
    }

    // Gives `to` the thumbnail of `from`, if it has one; not a capture, so the
    // captures switch does not apply.
    async copyThumbnail({
        from,
        to,
    }: {
        from: AppVersionRef;
        to: AppVersionRef;
    }): Promise<boolean> {
        const source = await this.findVersion(from.appUuid, from.version);
        if (!source?.hasThumbnail) return false;

        await this.storage.copy(
            versionThumbnailKey(from),
            versionThumbnailKey(to),
        );
        return this.appModel.setVersionThumbnail(to.appUuid, to.version);
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
        if (!version?.hasThumbnail || version.status !== 'ready') return null;
        return versionThumbnailKey({ appUuid, version: version.version });
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
            // The old image is only served while no version has ever had a
            // thumbnail, counting retired automatic ones, so an app that
            // only had automatic thumbnails shows none.
            if (await this.appModel.hasAnyVersionThumbnail(app.appUuid)) {
                return null;
            }
        }
        return (await this.storage.exists(appLevelKey)) ? appLevelKey : null;
    }
}
