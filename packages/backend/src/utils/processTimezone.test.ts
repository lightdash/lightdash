import { getProcessTimezoneWarning } from './processTimezone';

describe('getProcessTimezoneWarning (GLITCH-507)', () => {
    it('warns when the process is not UTC', () => {
        const warning = getProcessTimezoneWarning({
            timezoneOffsetMinutes: 300, // e.g. America/New_York
        });
        expect(warning).not.toBeNull();
        expect(warning).toMatch(/TZ=UTC/);
        expect(warning).toMatch(/docs\.lightdash\.com\/timezones/);
    });

    it('warns for negative offsets too (e.g. Asia/Tokyo)', () => {
        expect(
            getProcessTimezoneWarning({
                timezoneOffsetMinutes: -540,
            }),
        ).not.toBeNull();
    });

    it('does not warn when the process is UTC (offset 0)', () => {
        expect(
            getProcessTimezoneWarning({
                timezoneOffsetMinutes: 0,
            }),
        ).toBeNull();
    });
});
