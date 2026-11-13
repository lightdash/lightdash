import {
    ListObjectsV2Command,
    S3ServiceException,
    type S3Client,
} from '@aws-sdk/client-s3';
import {
    ParameterError,
    type AnalyticsActivityWindow,
} from '@lightdash/common';
import {
    AnalyticsQueryError,
    type DuckdbParquetSource,
} from '@lightdash/warehouses';
import { createHash } from 'crypto';
import { compactedStreamSchemas } from '../../../analytics/eventStream/registry';
import {
    usageDimensionKey,
    usageDimensionNames,
    usageDimensionSchemas,
    usageDimensionTable,
} from '../../../analytics/eventStream/usageDimensions';
import {
    usageHistoryKey,
    usageHistorySources,
} from '../../../analytics/eventStream/usageHistorySources';
import {
    analyticsStreams,
    userActivityColumns,
} from '../../../analytics/eventStream/userActivity';
import { createObjectUrlSigner } from '../../../clients/Aws/ObjectUrlSigner';
import {
    createS3ClientFromConfig,
    type S3ConnectionConfig,
} from '../../../clients/Aws/S3BaseClient';
import Logger from '../../../logging/logger';
import { analyticsFileCache } from './AnalyticsFileCache';
import { analyticsSignedUrlCache } from './AnalyticsSignedUrlCache';

type S3AnalyticsSourceConfig = {
    storage: S3ConnectionConfig & { bucket: string };
    organizationUuid: string;
    activityWindow?: AnalyticsActivityWindow;
    // Provisioning must authenticate storage before the first processing job.
    allowEmpty?: boolean;
};

const SIGNED_URL_LIFETIME_SECONDS = 900;
const MAX_FILES = 10_000;
const PREPARATION_CONCURRENCY = 8;
const EXPIRY_MARGIN_MS = 120_000;
const MAX_BUFFERED_BYTES = 32 * 1024 * 1024;

type AnalyticsFile = {
    key: string;
    etag?: string;
    size?: number;
};

// Drain started requests before destroying their SDK client, including failures.
const mapFiles = async <T>(
    files: readonly AnalyticsFile[],
    prepare: (file: AnalyticsFile) => Promise<T>,
): Promise<T[]> => {
    const values: T[] = [];
    for (let i = 0; i < files.length; i += PREPARATION_CONCURRENCY) {
        // eslint-disable-next-line no-await-in-loop
        const results = await Promise.allSettled(
            files.slice(i, i + PREPARATION_CONCURRENCY).map(prepare),
        );
        for (const result of results) {
            if (result.status === 'rejected') throw result.reason;
            values.push(result.value);
        }
    }
    return values;
};

const storageError = (error: unknown): AnalyticsQueryError => {
    if (error instanceof AnalyticsQueryError) return error;

    const status =
        error instanceof S3ServiceException
            ? error.$metadata.httpStatusCode
            : undefined;
    if (
        status === 401 ||
        status === 403 ||
        (error instanceof Error &&
            [
                'AccessDenied',
                'CredentialsProviderError',
                'ExpiredToken',
            ].includes(error.name))
    ) {
        return new AnalyticsQueryError('storage_access_denied', status);
    }
    if (
        error instanceof Error &&
        (['AbortError', 'TimeoutError'].includes(error.name) ||
            ('code' in error &&
                typeof error.code === 'string' &&
                [
                    'EAI_AGAIN',
                    'ECONNREFUSED',
                    'ECONNRESET',
                    'ENOTFOUND',
                    'ETIMEDOUT',
                ].includes(error.code)))
    ) {
        return new AnalyticsQueryError('storage_network_error', status);
    }
    return new AnalyticsQueryError('storage_read_failed', status);
};

/** Server-only: the caller must authorize the persisted project org first. */
export const createS3AnalyticsSourceResolver = ({
    storage,
    organizationUuid,
    activityWindow,
    allowEmpty = false,
}: S3AnalyticsSourceConfig): ((
    referencedTables?: readonly string[],
) => Promise<DuckdbParquetSource>) => {
    const { bucket } = storage;
    if (
        !/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(bucket) ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            organizationUuid,
        )
    ) {
        throw new ParameterError('Invalid analytics storage scope');
    }
    const endpoint = new URL(storage.endpoint ?? 'https://s3.amazonaws.com');
    if (
        (endpoint.protocol !== 'https:' &&
            !(
                endpoint.protocol === 'http:' &&
                ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
            )) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        endpoint.pathname !== '/'
    ) {
        throw new ParameterError(
            'Analytics storage requires a secure endpoint',
        );
    }
    const prefix = `events/compacted/org_id=${organizationUuid}/`;
    const scope = `${endpoint.origin}/${bucket}/${prefix.split('/').map(encodeURIComponent).join('/')}`;
    // A fresh SDK client per resolution avoids retaining credentials after reads.
    const config = {
        ...storage,
        endpoint: endpoint.origin,
        forcePathStyle: true,
    };
    return async (referencedTables) => {
        const requested = referencedTables?.length
            ? new Set(referencedTables)
            : undefined;
        const client = createS3ClientFromConfig(config);
        const started = performance.now();
        const filesByTable = new Map<string, AnalyticsFile[]>();
        const bufferedFiles = new Map<string, AnalyticsFile>();
        const tables = new Map<string, string[]>();
        const fileBuffers = new Map<string, Buffer>();
        let bufferedBytes = 0;
        let listingMs = 0;
        let downloadMs = 0;
        let signingMs = 0;
        let signedFiles = 0;
        let signatureCacheHits = 0;
        let hasEvents = false;
        const historySources = new Set<string>();
        const signingContext = async (s3: S3Client) => {
            // Resolve temporary credentials too: a cache hit cannot outlive them
            // or survive a changed credential/provider configuration.
            const credentials =
                config.authMode === 'gcp_oauth'
                    ? undefined
                    : await s3.config.credentials();
            const identity = createHash('sha256')
                .update(JSON.stringify([scope, config, credentials]))
                .digest('hex');
            const signer = createObjectUrlSigner(s3, config);
            return {
                identity,
                sign: async (file: AnalyticsFile) => {
                    const sign = () =>
                        signer.getSignedDownloadUrl(
                            bucket,
                            file.key,
                            SIGNED_URL_LIFETIME_SECONDS,
                        );
                    // Unversioned listings cannot safely identify reusable files.
                    const result = await analyticsSignedUrlCache.get({
                        identity: createHash('sha256')
                            .update(
                                JSON.stringify([
                                    identity,
                                    file.key,
                                    file.etag,
                                    file.size,
                                ]),
                            )
                            .digest('hex'),
                        expiresAt:
                            !file.etag || file.size === undefined
                                ? 0
                                : Math.min(
                                      Date.now() +
                                          SIGNED_URL_LIFETIME_SECONDS * 1000,
                                      credentials?.expiration?.getTime() ??
                                          Infinity,
                                  ) - EXPIRY_MARGIN_MS,
                        sign,
                    });
                    if (result.cacheHit) signatureCacheHits += 1;
                    else signedFiles += 1;
                    return result.url;
                },
            };
        };
        const objectUrl = (key: string) =>
            `${endpoint.origin}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
        try {
            let continuationToken: string | undefined;
            let pages = 0;
            let fileCount = 0;
            do {
                // eslint-disable-next-line no-await-in-loop
                const page = await client.send(
                    new ListObjectsV2Command({
                        Bucket: bucket,
                        Prefix: prefix,
                        MaxKeys: 1000,
                        ContinuationToken: continuationToken,
                    }),
                    { abortSignal: AbortSignal.timeout(30_000) },
                );
                // eslint-disable-next-line no-restricted-syntax
                for (const {
                    Key: key,
                    ETag: etag,
                    Size: size,
                } of page.Contents ?? []) {
                    if (!key || !key.startsWith(prefix)) {
                        throw new Error('Unexpected analytics object scope');
                    }
                    const match =
                        /^stream=(query_events|ai_usage|data_app_events|export_events|agent_steps|mcp_tool_calls|content_views|agent_request_events)\/dt=(\d{4}-\d{2}-\d{2})\/[a-zA-Z0-9_-]+\.parquet$/.exec(
                            key.slice(prefix.length),
                        );
                    const history = usageHistorySources.find(
                        (source) =>
                            key ===
                            usageHistoryKey(organizationUuid, source.name),
                    );
                    if (history) historySources.add(history.name);
                    const userActivity =
                        /^model=user_activity\/stream=(?:query_events|ai_usage|data_app_events|export_events|agent_steps|mcp_tool_calls|content_views)\/dt=(\d{4}-\d{2}-\d{2})\/activity\.parquet$/.exec(
                            key.slice(prefix.length),
                        );
                    const dimension = usageDimensionNames.find(
                        (name) =>
                            key === usageDimensionKey(organizationUuid, name),
                    );
                    let tableName = dimension
                        ? usageDimensionTable(dimension)
                        : (match?.[1] ?? null);
                    if (userActivity) tableName = 'user_activity';
                    if (history) tableName = history.name;
                    if (tableName) {
                        if (
                            match ||
                            history ||
                            userActivity ||
                            dimension === 'content' ||
                            dimension === 'people'
                        )
                            hasEvents = true;
                        // The activity builder writes each row's UTC day from its partition key.
                        const outsideActivityWindow =
                            userActivity &&
                            activityWindow &&
                            (userActivity[1] < activityWindow.start ||
                                userActivity[1] >= activityWindow.end);
                        if (
                            !outsideActivityWindow &&
                            (!requested || requested.has(tableName))
                        ) {
                            fileCount += 1;
                            if (fileCount > MAX_FILES)
                                throw new AnalyticsQueryError(
                                    'file_limit_exceeded',
                                );
                            const files = filesByTable.get(tableName) ?? [];
                            files.push({ key, etag, size });
                            filesByTable.set(tableName, files);
                        }
                    }
                }
                pages += 1;
                continuationToken = page.IsTruncated
                    ? page.NextContinuationToken
                    : undefined;
                if (page.IsTruncated && (!continuationToken || pages >= 100))
                    throw new Error('Analytics listing cannot be completed');
            } while (continuationToken);
            listingMs = performance.now() - started;
            const signing = await signingContext(client);
            for (const [tableName, files] of filesByTable) {
                // DuckDB stages whole tables to preserve Hive partition paths.
                // Avoid downloading a partial table that can only be read remotely.
                const bytes = files.reduce(
                    (sum, file) => sum + (file.size ?? 0),
                    0,
                );
                const canBuffer =
                    files.every(
                        ({ etag, size }) =>
                            etag &&
                            size &&
                            Number.isSafeInteger(size) &&
                            size > 0 &&
                            size <= 1024 * 1024,
                    ) && bufferedBytes + bytes <= MAX_BUFFERED_BYTES;
                const downloadStart = performance.now();
                const buffers = canBuffer
                    ? // eslint-disable-next-line no-await-in-loop
                      await mapFiles(files, (file) =>
                          analyticsFileCache.get(
                              signing.identity,
                              client,
                              bucket,
                              file.key,
                              file.etag,
                              file.size,
                          ),
                      )
                    : [];
                downloadMs += performance.now() - downloadStart;
                if (
                    buffers.length &&
                    buffers.every((buffer) => buffer !== undefined)
                ) {
                    bufferedBytes += bytes;
                    tables.set(
                        tableName,
                        files.map((file, index) => {
                            const url = objectUrl(file.key);
                            fileBuffers.set(url, buffers[index]!);
                            bufferedFiles.set(url, file);
                            return url;
                        }),
                    );
                } else {
                    const signStart = performance.now();
                    // eslint-disable-next-line no-await-in-loop
                    tables.set(tableName, await mapFiles(files, signing.sign));
                    signingMs += performance.now() - signStart;
                }
            }
            Logger.info('Analytics source prepared', {
                organizationUuid,
                files: fileCount,
                pages,
                bufferedFiles: fileBuffers.size,
                bufferedBytes,
                signedFiles,
                signatureCacheHits,
                listingMs: Math.round(listingMs),
                downloadMs: Math.round(downloadMs),
                signingMs: Math.round(signingMs),
                totalMs: Math.round(performance.now() - started),
            });
        } catch (error) {
            // SDK errors may contain credentials, signatures, or object contents.
            throw storageError(error);
        } finally {
            client.destroy();
        }
        if (!hasEvents && !allowEmpty) {
            throw new ParameterError(
                'No analytics data is available yet. Newly captured events become available after daily processing. Try again after the next daily update.',
            );
        }
        const schemas = [
            ...usageDimensionNames.map((name) => ({
                name: usageDimensionTable(name),
                columns: usageDimensionSchemas[name],
            })),
            ...analyticsStreams.map((name) => ({
                name,
                columns: historySources.has(name)
                    ? (usageHistorySources.find(
                          (source) => source.name === name,
                      )?.columns ?? compactedStreamSchemas[name])
                    : compactedStreamSchemas[name],
            })),
            {
                name: 'agent_request_events',
                columns: compactedStreamSchemas.agent_request_events,
            },
            { name: 'user_activity', columns: userActivityColumns },
            {
                name: 'historical_activity',
                columns: usageHistorySources[2].columns,
            },
        ];
        return {
            scope,
            signedUrls: true,
            ...(fileBuffers.size
                ? {
                      fileBuffers,
                      getSignedUrls: async (urls: readonly string[]) => {
                          // Staging happens after this resolver's SDK client is closed.
                          // Only exact buffered objects from this manifest may fall back.
                          const fallbackClient =
                              createS3ClientFromConfig(config);
                          const fallbackStart = performance.now();
                          try {
                              const files = urls.map((url) => {
                                  const file = bufferedFiles.get(url);
                                  if (!file)
                                      throw new Error(
                                          'Unexpected analytics object',
                                      );
                                  return file;
                              });
                              const signing =
                                  await signingContext(fallbackClient);
                              return await mapFiles(files, signing.sign);
                          } catch (error) {
                              throw storageError(error);
                          } finally {
                              fallbackClient.destroy();
                              Logger.info('Analytics source staging fallback', {
                                  organizationUuid,
                                  files: urls.length,
                                  signingMs: Math.round(
                                      performance.now() - fallbackStart,
                                  ),
                              });
                          }
                      },
                  }
                : {}),
            emptyTables: schemas.filter(({ name }) => !tables.has(name)),
            tables: [...tables].map(([name, urls]) => ({
                name,
                urls: urls.sort(),
                columns: schemas.find((schema) => schema.name === name)
                    ?.columns,
                ...(historySources.has(name)
                    ? {
                          hivePartitioning: false,
                          fallbackRows: usageHistorySources.find(
                              (source) => source.name === name,
                          )?.fallbackRows,
                      }
                    : {}),
            })),
        };
    };
};
