import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';
import {
    getTotalCount,
    runTimezoneTestQuery,
    updateDataTimezone,
} from '../helpers/timezone-test';

/**
 * `convert_timezone: false` must be honoured by filters, not just display.
 *
 * The `event_timestamp_raw_utc` dimension opts out of timezone conversion, so
 * its day bucket always reflects the raw warehouse value regardless of the
 * query timezone. The filter on that dimension must compare against the same
 * raw value — otherwise a row buckets to one day but matches a filter for a
 * different day.
 *
 * Boundary row #11 is 2024-01-14 15:00Z:
 *   - convert_timezone: false → raw day bucket is 2024-01-14 in every timezone.
 *   - normal dimension in Asia/Tokyo (+9) → bucket shifts to 2024-01-15.
 *
 * Requires LIGHTDASH_ENABLE_TIMEZONE_SUPPORT=true in the environment.
 */

let admin: ApiClient;

const RAW_UTC_DAY = 'timezone_test_event_timestamp_raw_utc_day';
const DAY = 'timezone_test_event_timestamp_day';
const COUNT = 'timezone_test_count';

const dayEquals = (fieldId: string, value: string) => ({
    dimensions: {
        id: 'day-filter',
        and: [
            {
                id: 'day-eq',
                target: { fieldId },
                operator: 'equals',
                values: [value],
            },
        ],
    },
});

const countFor = async (
    dim: string,
    filterDay: string,
    timezone: string,
): Promise<number> => {
    const rows = await runTimezoneTestQuery(admin, {
        dimensions: [dim],
        metrics: [COUNT],
        eventIds: [11],
        timezone,
        filters: dayEquals(dim, filterDay),
    });
    return getTotalCount(rows, COUNT);
};

describe('convert_timezone: false is honoured by filters', () => {
    beforeAll(async () => {
        admin = await login();
        await updateDataTimezone(admin, undefined);
    });

    describe('opted-out dimension filters against the raw value (Asia/Tokyo)', () => {
        it('matches the raw bucket day the row displays under', async () => {
            expect(
                await countFor(RAW_UTC_DAY, '2024-01-14', 'Asia/Tokyo'),
            ).toBe(1);
        });

        it('does not match the timezone-shifted day', async () => {
            expect(
                await countFor(RAW_UTC_DAY, '2024-01-15', 'Asia/Tokyo'),
            ).toBe(0);
        });
    });

    describe('normal dimension still shifts with the query timezone (Asia/Tokyo)', () => {
        it('matches the shifted bucket day', async () => {
            expect(await countFor(DAY, '2024-01-15', 'Asia/Tokyo')).toBe(1);
        });

        it('does not match the raw UTC day', async () => {
            expect(await countFor(DAY, '2024-01-14', 'Asia/Tokyo')).toBe(0);
        });
    });
});
