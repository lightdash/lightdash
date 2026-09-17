import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ParameterError } from '@lightdash/common';
import { type DuckdbParquetSource } from '@lightdash/warehouses';
import {
    usageDimensionKey,
    usageDimensionNames,
    usageDimensionSchemas,
    usageDimensionTable,
} from '../../../analytics/eventStream/usageDimensions';
import {
    createS3ClientFromConfig,
    type S3ConnectionConfig,
} from '../../../clients/Aws/S3BaseClient';

type S3AnalyticsSourceConfig = {
    storage: S3ConnectionConfig & { bucket: string };
    organizationUuid: string;
};

const SIGNED_URL_LIFETIME_SECONDS = 900;
const MAX_FILES = 10_000;

/** Server-only: the caller must authorize the persisted project org first. */
export const createS3AnalyticsSourceResolver = ({
    storage,
    organizationUuid,
}: S3AnalyticsSourceConfig): (() => Promise<DuckdbParquetSource>) => {
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
    return async () => {
        const client = createS3ClientFromConfig(config);
        const tables = new Map<string, string[]>();
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
                // eslint-disable-next-line no-restricted-syntax
                for (const { Key: key } of page.Contents ?? []) {
                    if (!key || !key.startsWith(prefix)) {
                        throw new Error('Unexpected analytics object scope');
                    }
                    const match =
                        /^stream=(query_events|ai_usage|data_app_events|export_events)\/dt=(\d{4}-\d{2}-\d{2})\/[a-zA-Z0-9_-]+\.parquet$/.exec(
                            key.slice(prefix.length),
                        );
                    const dimension = usageDimensionNames.find(
                        (name) =>
                            key === usageDimensionKey(organizationUuid, name),
                    );
                    const tableName =
                        match?.[1] ??
                        (dimension ? usageDimensionTable(dimension) : null);
                    // Expose all retained partitions. Date filters belong to
                    // the Explore query, not a fixed source-level window.
                    if (tableName) {
                        if (match) hasEvents = true;
                        fileCount += 1;
                        if (fileCount > MAX_FILES)
                            throw new Error(
                                'Analytics manifest exceeds file limit',
                            );
                        // eslint-disable-next-line no-await-in-loop
                        const url = await getSignedUrl(
                            client,
                            new GetObjectCommand({ Bucket: bucket, Key: key }),
                            { expiresIn: SIGNED_URL_LIFETIME_SECONDS },
                        );
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
        return {
            scope,
            signedUrls: true,
            emptyTables: usageDimensionNames
                .filter((name) => !tables.has(usageDimensionTable(name)))
                .map((name) => ({
                    name: usageDimensionTable(name),
                    columns: usageDimensionSchemas[name],
                })),
            tables: [...tables].map(([name, urls]) => ({
                name,
                urls: urls.sort(),
            })),
        };
    };
};
