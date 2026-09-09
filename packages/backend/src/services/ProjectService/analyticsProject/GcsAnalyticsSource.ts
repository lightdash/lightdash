import { ParameterError } from '@lightdash/common';
import { type DuckdbParquetSource } from '@lightdash/warehouses';

export type GcsAnalyticsSourceConfig = {
    bucket: string;
    organizationUuid: string;
    startDate: string;
    endDate: string;
    getAccessToken: () => Promise<string>;
};

/** Read-only discovery of a bounded, single-org file manifest. */
export const resolveGcsAnalyticsSource = async ({
    bucket,
    organizationUuid,
    startDate,
    endDate,
    getAccessToken,
}: GcsAnalyticsSourceConfig): Promise<DuckdbParquetSource> => {
    if (
        !/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(bucket) ||
        !/^[a-f0-9-]{36}$/.test(organizationUuid) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
        startDate > endDate
    ) {
        throw new ParameterError(
            'Invalid analytics bucket, organization, or date range',
        );
    }
    const prefix = `events/compacted/org_id=${organizationUuid}/`;
    const scope = `https://storage.googleapis.com/${bucket}/${prefix}`;
    const token = await getAccessToken();
    const tables = new Map<string, string[]>();
    let pageToken: string | undefined;
    let pages = 0;
    do {
        const url = new URL(
            `https://storage.googleapis.com/storage/v1/b/${bucket}/o`,
        );
        url.searchParams.set('prefix', prefix);
        url.searchParams.set('maxResults', '1000');
        url.searchParams.set('fields', 'items(name),nextPageToken');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        // eslint-disable-next-line no-await-in-loop
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
            // Do not include request headers or credential-bearing SDK errors.
            throw new Error(
                `Analytics object listing failed (HTTP ${response.status})`,
            );
        }
        // eslint-disable-next-line no-await-in-loop
        const page = (await response.json()) as {
            items?: { name: string }[];
            nextPageToken?: string;
        };
        for (const { name } of page.items ?? []) {
            if (!name.startsWith(prefix))
                throw new Error('Unexpected cross-org analytics object');
            const match =
                /^stream=(query_events|ai_usage)\/dt=(\d{4}-\d{2}-\d{2})\/[^/]+\.parquet$/.exec(
                    name.slice(prefix.length),
                );
            if (match && match[2] >= startDate && match[2] <= endDate) {
                const urls = tables.get(match[1]) ?? [];
                urls.push(`https://storage.googleapis.com/${bucket}/${name}`);
                tables.set(match[1], urls);
            }
        }
        pageToken = page.nextPageToken;
        pages += 1;
        if (pageToken && pages >= 100)
            throw new Error(
                'Analytics manifest exceeds the local triage limit',
            );
    } while (pageToken);
    if (tables.size === 0)
        throw new Error(
            'No compacted analytics Parquet files found in the requested date range',
        );
    return {
        scope,
        httpAuth: { bearerToken: token },
        tables: [...tables].map(([name, urls]) => ({
            name,
            urls: urls.sort(),
        })),
    };
};
