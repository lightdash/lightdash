import {
    compareSlackTimestamps,
    slackTimestampToDate,
} from './slackTimestamps';

describe('Slack timestamps', () => {
    it('orders epoch widths and fractional precision', () => {
        expect(compareSlackTimestamps('999999999.9', '1000000000.1')).toBe(-1);
        expect(compareSlackTimestamps('100.01', '100.001')).toBe(1);
        expect(compareSlackTimestamps('100.100', '100.1')).toBe(0);
    });

    it('converts timestamps without losing fractional precision', () => {
        expect(slackTimestampToDate('100.123456')?.toISOString()).toBe(
            '1970-01-01T00:01:40.123Z',
        );
        expect(slackTimestampToDate('invalid')).toBeNull();
    });
});
