import {
    HeadObjectCommand,
    S3ServiceException,
    type S3Client,
} from '@aws-sdk/client-s3';
import { createS3ClientFromConfig } from '../../../clients/Aws/S3BaseClient';
import { type S3Config } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import { versionPrefix } from './appCode';

// Shared with the preview router so the served paths and the existence check
// can't drift apart.
export const appVersionIndexHtmlKey = (
    appUuid: string,
    version: number,
): string => `${versionPrefix(appUuid, version)}index.html`;

export const appVersionAssetKey = (
    appUuid: string,
    version: number,
    filename: string,
): string => `${versionPrefix(appUuid, version)}assets/${filename}`;

export type BundleServableChecker = (
    appUuid: string,
    version: number,
) => Promise<boolean>;

const alwaysServable: BundleServableChecker = async () => true;

// Fails open: only a confirmed-missing object is unservable, and results are
// never cached, since a disappearing bundle is what this check exists to catch.
const createBundleServableChecker = (
    s3Config: S3Config,
): BundleServableChecker => {
    let client: S3Client | null = null;

    return async (appUuid, version) => {
        const key = appVersionIndexHtmlKey(appUuid, version);

        try {
            // Built here so a credential-resolution throw fails open too.
            if (!client) {
                client = createS3ClientFromConfig(s3Config);
            }

            await client.send(
                new HeadObjectCommand({ Bucket: s3Config.bucket, Key: key }),
            );
            return true;
        } catch (error) {
            // Only object-level names prove the bundle is gone: `NoSuchBucket`
            // is also a 404, and a missing key is a 403 without `s3:ListBucket`.
            if (
                error instanceof S3ServiceException &&
                (error.name === 'NotFound' || error.name === 'NoSuchKey')
            ) {
                Logger.warn(
                    `App bundle missing for app=${appUuid} version=${version}, reporting the version as unavailable`,
                );
                return false;
            }

            Logger.warn(
                `Could not verify app bundle for app=${appUuid} version=${version}, assuming servable: ${
                    error instanceof S3ServiceException
                        ? `${error.name} (${error.$metadata?.httpStatusCode})`
                        : String(error)
                }`,
            );
            return true;
        }
    };
};

// Keyed on the config object, a per-process singleton, so each deployment builds
// one S3 client instead of one per render-metadata request.
const checkersByConfig = new WeakMap<S3Config, BundleServableChecker>();

export const getBundleServableChecker = (
    s3Config: S3Config | null,
): BundleServableChecker => {
    if (!s3Config) {
        return alwaysServable;
    }
    const cached = checkersByConfig.get(s3Config);
    if (cached) {
        return cached;
    }
    const checker = createBundleServableChecker(s3Config);
    checkersByConfig.set(s3Config, checker);
    return checker;
};
