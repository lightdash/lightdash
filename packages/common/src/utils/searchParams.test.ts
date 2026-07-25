import { appendUuidParam } from './searchParams';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

describe('appendUuidParam', () => {
    it('appends the param with `?` when the URL has no query string', () => {
        expect(
            appendUuidParam('https://app/view', 'scheduler_uuid', VALID_UUID),
        ).toBe(`https://app/view?scheduler_uuid=${VALID_UUID}`);
    });

    it('appends the param with `&` when the URL already has a query string', () => {
        expect(
            appendUuidParam(
                'https://app/view?isSync=true',
                'scheduler_uuid',
                VALID_UUID,
            ),
        ).toBe(`https://app/view?isSync=true&scheduler_uuid=${VALID_UUID}`);
    });

    it('returns the URL unchanged (no dangling `?`) when the value is undefined', () => {
        expect(
            appendUuidParam('https://app/view', 'scheduler_uuid', undefined),
        ).toBe('https://app/view');
    });

    it('returns the URL unchanged when the value is null', () => {
        expect(
            appendUuidParam('https://app/view', 'scheduler_uuid', null),
        ).toBe('https://app/view');
    });

    it('returns the URL unchanged when the value is not a valid uuid', () => {
        expect(
            appendUuidParam('https://app/view', 'scheduler_uuid', 'sched-1'),
        ).toBe('https://app/view');
    });
});
