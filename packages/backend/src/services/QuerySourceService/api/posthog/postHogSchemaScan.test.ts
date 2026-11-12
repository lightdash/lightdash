import { DimensionType, WarehouseQueryError } from '@lightdash/common';
import type { ApiConnectorResult } from '../ApiConnector';
import {
    POSTHOG_EVENTS_QUERY,
    POSTHOG_PROPERTY_KEYS_QUERY,
    scanPostHogSchema,
    toFailedScan,
    toPostHogSchemaTable,
} from './postHogSchemaScan';

const now = new Date('2026-11-02T10:00:00Z');

const result = (
    rows: Record<string, unknown>[],
    hasMoreRows = false,
): ApiConnectorResult => ({ columns: [], rows, hasMoreRows, bytesRead: null });

const eventsResult = result(
    [
        { event_name: '$pageview', event_count: 1200 },
        { event_name: 'signed_up', event_count: '40' },
        { event_name: null, event_count: 3 },
    ],
    true,
);

describe('scanPostHogSchema', () => {
    it('maps event counts and property keys from two HogQL calls', async () => {
        const execute = vi
            .fn()
            .mockResolvedValueOnce(eventsResult)
            .mockResolvedValueOnce(
                result([
                    { property_key: '$browser', occurrences: 900 },
                    { property_key: 'plan tier', occurrences: 12 },
                ]),
            );
        const getConnector = vi.fn().mockResolvedValue({ execute });

        await expect(
            scanPostHogSchema(getConnector, () => now),
        ).resolves.toEqual({
            status: 'ready',
            scannedAt: now,
            windowDays: 30,
            events: [
                { name: '$pageview', count: 1200 },
                { name: 'signed_up', count: 40 },
            ],
            eventsTruncated: true,
            propertyKeys: ['$browser', 'plan tier'],
        });
        expect(getConnector).toHaveBeenCalledTimes(2);
        expect(execute.mock.calls.map(([args]) => args.payload.query)).toEqual([
            POSTHOG_EVENTS_QUERY,
            POSTHOG_PROPERTY_KEYS_QUERY,
        ]);
    });

    it('keeps the events when the property scan fails', async () => {
        const execute = vi
            .fn()
            .mockResolvedValueOnce(eventsResult)
            .mockRejectedValueOnce(new WarehouseQueryError('Unknown function'));

        const scan = await scanPostHogSchema(
            async () => ({ execute }),
            () => now,
        );

        expect(scan).toMatchObject({ status: 'ready', propertyKeys: null });
    });

    it('fails when the event scan fails', async () => {
        const execute = vi
            .fn()
            .mockRejectedValue(new WarehouseQueryError('Bad key'));

        await expect(
            scanPostHogSchema(async () => ({ execute })),
        ).rejects.toThrow('Bad key');
        expect(toFailedScan(new Error('Bad key'), () => now)).toEqual({
            status: 'failed',
            scannedAt: now,
            error: 'Bad key',
        });
    });
});

describe('toPostHogSchemaTable', () => {
    it('describes the busiest events and quotes property references', () => {
        const table = toPostHogSchemaTable(
            { connectionUuid: 'conn-1', name: 'Product analytics' },
            {
                status: 'ready',
                scannedAt: now,
                windowDays: 30,
                events: [
                    { name: '$pageview', count: 1200 },
                    { name: 'signed_up', count: 40 },
                ],
                eventsTruncated: false,
                propertyKeys: ['$browser', "plan's tier"],
            },
        );

        expect(table.reference).toBe('conn-1');
        expect(table.label).toBe('Product analytics');
        expect(table.description).toBe(
            'HogQL table "events" in PostHog. 2 event names seen in the last 30 days, busiest first: "$pageview" (1200), "signed_up" (40)',
        );
        expect(
            table.columns.map(({ reference, type }) => [reference, type]),
        ).toEqual([
            ['event', DimensionType.STRING],
            ['timestamp', DimensionType.TIMESTAMP],
            ['distinct_id', DimensionType.STRING],
            ['person_id', DimensionType.STRING],
            ['properties.$browser', DimensionType.STRING],
            ["properties['plan\\'s tier']", DimensionType.STRING],
        ]);
    });
});
