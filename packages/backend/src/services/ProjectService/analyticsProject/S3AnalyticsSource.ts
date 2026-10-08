import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { ParameterError } from '@lightdash/common';
import { type DuckdbParquetSource } from '@lightdash/warehouses';
import { compactedStreamSchemas } from '../../../analytics/eventStream/registry';
import {
    usageDimensionKey,
    usageDimensionNames,
    usageDimensionSchemas,
    usageDimensionTable,
} from '../../../analytics/eventStream/usageDimensions';
import {
    analyticsStreams,
    userActivityColumns,
} from '../../../analytics/eventStream/userActivity';
import { createObjectUrlSigner } from '../../../clients/Aws/ObjectUrlSigner';
import {
    createS3ClientFromConfig,
    type S3ConnectionConfig,
} from '../../../clients/Aws/S3BaseClient';
import { analyticsFileCache } from './AnalyticsFileCache';

type S3AnalyticsSourceConfig = {
    storage: S3ConnectionConfig & { bucket: string };
    organizationUuid: string;
};

const SIGNED_URL_LIFETIME_SECONDS = 900;
const MAX_FILES = 10_000;
const SIGNING_CONCURRENCY = 8;

/** Server-only: the caller must authorize the persisted project org first. */
export const createS3AnalyticsSourceResolver = ({
    storage,
    organizationUuid,
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
        const urlSigner = createObjectUrlSigner(client, config);
        const tables = new Map<string, string[]>();
        const fileBuffers = new Map<string, Buffer>();
        let bufferedBytes = 0;
        let hasEvents = false;
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
                const files: {
                    key: string;
                    tableName: string;
                    etag?: string;
                    size?: number;
                }[] = [];
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
                    const userActivity =
                        /^model=user_activity\/stream=(query_events|ai_usage|data_app_events|export_events|agent_steps|mcp_tool_calls|content_views)\/dt=(\d{4}-\d{2}-\d{2})\/activity\.parquet$/.test(
                            key.slice(prefix.length),
                        );
                    const dimension = usageDimensionNames.find(
                        (name) =>
                            key === usageDimensionKey(organizationUuid, name),
                    );
                    const tableName =
                        (userActivity ? 'user_activity' : match?.[1]) ??
                        (dimension ? usageDimensionTable(dimension) : null);
                    // Expose all retained partitions. Date filters belong to
                    // the Explore query, not a fixed source-level window.
                    if (tableName) {
                        if (
                            match ||
                            userActivity ||
                            dimension === 'content' ||
                            dimension === 'people'
                        )
                            hasEvents = true;
                        fileCount += 1;
                        if (fileCount > MAX_FILES)
                            throw new Error(
                                'Analytics manifest exceeds file limit',
                            );
                        if (!requested || requested.has(tableName)) {
                            files.push({ key, tableName, etag, size });
                        }
                    }
                }
                // GCS workload identity signs each URL remotely. Bound each
                // batch, and drain all started requests before destroying the
                // client on failure. Never return a partial manifest.
                for (let i = 0; i < files.length; i += SIGNING_CONCURRENCY) {
                    // eslint-disable-next-line no-await-in-loop
                    const signed = await Promise.allSettled(
                        files
                            .slice(i, i + SIGNING_CONCURRENCY)
                            // Reserve each buffer synchronously before any download awaits.
                            // eslint-disable-next-line no-loop-func
                            .map(async ({ key, tableName, etag, size }) => {
                                // Bound retained buffers and temporary files per query too.
                                const cacheable =
                                    !!size &&
                                    size <= 1024 * 1024 &&
                                    bufferedBytes + size <= 8 * 1024 * 1024;
                                if (cacheable) bufferedBytes += size!;
                                const buffer = cacheable
                                    ? await analyticsFileCache.get(
                                          scope,
                                          client,
                                          bucket,
                                          key,
                                          etag,
                                          size,
                                      )
                                    : undefined;
                                const url =
                                    await urlSigner.getSignedDownloadUrl(
                                        bucket,
                                        key,
                                        SIGNED_URL_LIFETIME_SECONDS,
                                    );
                                if (buffer) fileBuffers.set(url, buffer);
                                return { tableName, url };
                            }),
                    );
                    for (const result of signed) {
                        if (result.status === 'rejected') {
                            // The outer handler sanitizes all storage failures.
                            throw new Error('Analytics URL signing failed');
                        }
                        const { tableName, url } = result.value;
                        const urls = tables.get(tableName) ?? [];
                        urls.push(url);
                        tables.set(tableName, urls);
                    }
                }
                pages += 1;
                continuationToken = page.IsTruncated
                    ? page.NextContinuationToken
                    : undefined;
                if (page.IsTruncated && (!continuationToken || pages >= 100))
                    throw new Error('Analytics listing cannot be completed');
            } while (continuationToken);
        } catch {
            // SDK errors may contain credentials, signatures, or object contents.
            throw new Error(
                'Analytics storage access failed. Check bucket credentials, organization and compacted data availability.',
            );
        } finally {
            client.destroy();
        }
        if (!hasEvents) {
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
                columns: compactedStreamSchemas[name],
            })),
            {
                name: 'agent_request_events',
                columns: compactedStreamSchemas.agent_request_events,
            },
            { name: 'user_activity', columns: userActivityColumns },
        ];
        return {
            scope,
            signedUrls: true,
            ...(fileBuffers.size ? { fileBuffers } : {}),
            emptyTables: schemas.filter(({ name }) => !tables.has(name)),
            tables: [...tables].map(([name, urls]) => ({
                name,
                urls: urls.sort(),
                columns: schemas.find((schema) => schema.name === name)
                    ?.columns,
            })),
        };
    };
};
