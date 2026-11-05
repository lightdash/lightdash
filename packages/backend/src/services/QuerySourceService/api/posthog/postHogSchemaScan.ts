import {
    DimensionType,
    getErrorMessage,
    type ApiSourceSchemaScan,
    type QuerySourceSchemaTable,
} from '@lightdash/common';
import type { ApiConnector } from '../ApiConnector';

export const POSTHOG_SCAN_WINDOW_DAYS = 30;
const MAX_EVENTS = 1_000;
const MAX_PROPERTY_KEYS = 500;
const PROPERTY_SAMPLE_ROWS = 10_000;
const DESCRIBED_EVENTS = 50;
const PLAIN_PROPERTY_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const toPropertyReference = (key: string): string =>
    PLAIN_PROPERTY_KEY.test(key)
        ? `properties.${key}`
        : `properties['${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;

export const POSTHOG_EVENTS_QUERY = `SELECT event AS event_name, count() AS event_count
FROM events
WHERE timestamp > now() - INTERVAL ${POSTHOG_SCAN_WINDOW_DAYS} DAY
GROUP BY event_name
ORDER BY event_count DESC`;

// Samples recent events so the key scan stays cheap on large projects.
export const POSTHOG_PROPERTY_KEYS_QUERY = `SELECT property_key, count() AS occurrences
FROM (
    SELECT arrayJoin(JSONExtractKeys(properties)) AS property_key
    FROM events
    WHERE timestamp > now() - INTERVAL 1 DAY
    LIMIT ${PROPERTY_SAMPLE_ROWS}
)
GROUP BY property_key
ORDER BY occurrences DESC`;

/** Each query needs its own connector: a metered connector allows one call per query. */
type GetConnector = () => Promise<Pick<ApiConnector, 'execute'>>;

/** Two HogQL calls: event names with counts, then property keys from a sample. */
export const scanPostHogSchema = async (
    getConnector: GetConnector,
    now: () => Date = () => new Date(),
): Promise<ApiSourceSchemaScan> => {
    const events = await (
        await getConnector()
    ).execute({
        payload: { kind: 'query', query: POSTHOG_EVENTS_QUERY },
        limit: MAX_EVENTS,
    });
    let propertyKeys: string[] | null;
    try {
        const properties = await (
            await getConnector()
        ).execute({
            payload: { kind: 'query', query: POSTHOG_PROPERTY_KEYS_QUERY },
            limit: MAX_PROPERTY_KEYS,
        });
        propertyKeys = properties.rows.flatMap(({ property_key: key }) =>
            typeof key === 'string' ? [key] : [],
        );
    } catch {
        propertyKeys = null;
    }
    return {
        status: 'ready',
        scannedAt: now(),
        windowDays: POSTHOG_SCAN_WINDOW_DAYS,
        events: events.rows.flatMap(
            ({ event_name: name, event_count: count }) =>
                typeof name === 'string'
                    ? [{ name, count: Number(count) || 0 }]
                    : [],
        ),
        eventsTruncated: events.truncated,
        propertyKeys,
    };
};

export const toFailedScan = (
    error: unknown,
    now: () => Date = () => new Date(),
): ApiSourceSchemaScan => ({
    status: 'failed',
    scannedAt: now(),
    error: getErrorMessage(error),
});

/** A scanned connection as a schema table: the events table, with its busiest events in the description. */
export const toPostHogSchemaTable = (
    connection: { connectionUuid: string; name: string },
    scan: Extract<ApiSourceSchemaScan, { status: 'ready' }>,
): QuerySourceSchemaTable => ({
    reference: connection.connectionUuid,
    label: connection.name,
    description: `HogQL table "events" in PostHog. ${
        scan.events.length
    } event names seen in the last ${scan.windowDays} days, busiest first: ${scan.events
        .slice(0, DESCRIBED_EVENTS)
        .map(({ name, count }) => `${JSON.stringify(name)} (${count})`)
        .join(', ')}${scan.events.length > DESCRIBED_EVENTS ? ', …' : ''}`,
    columns: [
        { name: 'event', type: DimensionType.STRING },
        { name: 'timestamp', type: DimensionType.TIMESTAMP },
        { name: 'distinct_id', type: DimensionType.STRING },
        { name: 'person_id', type: DimensionType.STRING },
        ...(scan.propertyKeys ?? []).map((key) => ({
            name: toPropertyReference(key),
            type: DimensionType.STRING,
        })),
    ].map(({ name, type }) => ({
        reference: name,
        type,
        label: null,
        description: null,
    })),
});
