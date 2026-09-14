import { flush, record } from './flagCheckAggregator';

describe('flagCheckAggregator', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime('2026-07-25T00:00:00.000Z');
        flush();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('aggregates checks by flag and resolved value', () => {
        record('test-flag', 'org-1', true);
        record('test-flag', 'org-1', false);
        record('test-flag', null, false);

        vi.advanceTimersByTime(15 * 60 * 1000);

        expect(flush()).toEqual([
            {
                flagId: 'test-flag',
                checkCount: 3,
                enabledCount: 1,
                disabledCount: 2,
                uniqueOrgCount: 1,
                orgUuids: ['org-1'],
                orgUuidsTruncated: false,
                windowStartAt: '2026-07-25T00:00:00.000Z',
                windowEndAt: '2026-07-25T00:15:00.000Z',
            },
        ]);
    });

    it('caps organization UUIDs at 50 and marks truncated aggregates', () => {
        Array.from({ length: 50 }, (_, index) => `org-${index}`).forEach(
            (orgUuid) => record('capped-flag', orgUuid, true),
        );
        Array.from({ length: 51 }, (_, index) => `org-${index}`).forEach(
            (orgUuid) => record('truncated-flag', orgUuid, false),
        );

        const [cappedEntry, truncatedEntry] = flush();

        expect(cappedEntry).toMatchObject({
            flagId: 'capped-flag',
            uniqueOrgCount: 50,
            orgUuidsTruncated: false,
        });
        expect(cappedEntry.orgUuids).toHaveLength(50);
        expect(truncatedEntry).toMatchObject({
            flagId: 'truncated-flag',
            uniqueOrgCount: 50,
            orgUuidsTruncated: true,
        });
        expect(truncatedEntry.orgUuids).toHaveLength(50);
        expect(truncatedEntry.orgUuids).not.toContain('org-50');
    });

    it('resets aggregates and advances the window on flush', () => {
        record('test-flag', 'org-1', true);
        vi.advanceTimersByTime(1000);

        expect(flush()).toHaveLength(1);
        expect(flush()).toEqual([]);

        vi.advanceTimersByTime(1000);
        record('test-flag', 'org-2', false);

        expect(flush()).toEqual([
            {
                flagId: 'test-flag',
                checkCount: 1,
                enabledCount: 0,
                disabledCount: 1,
                uniqueOrgCount: 1,
                orgUuids: ['org-2'],
                orgUuidsTruncated: false,
                windowStartAt: '2026-07-25T00:00:01.000Z',
                windowEndAt: '2026-07-25T00:00:02.000Z',
            },
        ]);
    });
});
