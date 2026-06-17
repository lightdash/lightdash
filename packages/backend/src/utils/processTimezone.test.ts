import { getProcessTimezoneWarning } from './processTimezone';

describe('getProcessTimezoneWarning (GLITCH-507)', () => {
    it('warns when timezone support is on and the process is not UTC', () => {
        const warning = getProcessTimezoneWarning({
            enableTimezoneSupport: true,
            timezoneOffsetMinutes: 300, // e.g. America/New_York
        });
        expect(warning).not.toBeNull();
        expect(warning).toMatch(/TZ=UTC/);
        expect(warning).toMatch(/docs\.lightdash\.com\/timezones/);
    });

    it('warns for negative offsets too (e.g. Asia/Tokyo)', () => {
        expect(
            getProcessTimezoneWarning({
                enableTimezoneSupport: true,
                timezoneOffsetMinutes: -540,
            }),
        ).not.toBeNull();
    });

    it('does not warn when the process is UTC (offset 0)', () => {
        expect(
            getProcessTimezoneWarning({
                enableTimezoneSupport: true,
                timezoneOffsetMinutes: 0,
            }),
        ).toBeNull();
    });

    it('does not warn when timezone support is off, regardless of offset', () => {
        expect(
            getProcessTimezoneWarning({
                enableTimezoneSupport: false,
                timezoneOffsetMinutes: 300,
            }),
        ).toBeNull();
        expect(
            getProcessTimezoneWarning({
                enableTimezoneSupport: false,
                timezoneOffsetMinutes: 0,
            }),
        ).toBeNull();
    });
});
