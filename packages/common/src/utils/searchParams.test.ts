import { appendUuidQueryParam } from './searchParams';

const VALID_UUID = '4f5b6c7d-8e9f-4a1b-b2c3-d4e5f6a7b8c9';

describe('appendUuidQueryParam', () => {
    it('appends the param when the uuid is valid', () => {
        expect(
            appendUuidQueryParam(
                'https://app.lightdash.com/dashboards/abc/view',
                'scheduler_uuid',
                VALID_UUID,
            ),
        ).toBe(
            `https://app.lightdash.com/dashboards/abc/view?scheduler_uuid=${VALID_UUID}`,
        );
    });

    it('returns the url unchanged when the uuid is undefined', () => {
        expect(
            appendUuidQueryParam(
                'https://app.lightdash.com/dashboards/abc/view',
                'scheduler_uuid',
                undefined,
            ),
        ).toBe('https://app.lightdash.com/dashboards/abc/view');
    });

    it('returns the url unchanged when the uuid is null', () => {
        expect(
            appendUuidQueryParam(
                'https://app.lightdash.com/dashboards/abc/view',
                'scheduler_uuid',
                null,
            ),
        ).toBe('https://app.lightdash.com/dashboards/abc/view');
    });

    it('returns the url unchanged when the uuid is invalid', () => {
        expect(
            appendUuidQueryParam(
                'https://app.lightdash.com/dashboards/abc/view',
                'scheduler_uuid',
                'not-a-uuid',
            ),
        ).toBe('https://app.lightdash.com/dashboards/abc/view');
    });

    it('preserves an existing query string', () => {
        expect(
            appendUuidQueryParam(
                'https://app.lightdash.com/dashboards/abc/view?foo=bar',
                'scheduler_uuid',
                VALID_UUID,
            ),
        ).toBe(
            `https://app.lightdash.com/dashboards/abc/view?foo=bar&scheduler_uuid=${VALID_UUID}`,
        );
    });
});
