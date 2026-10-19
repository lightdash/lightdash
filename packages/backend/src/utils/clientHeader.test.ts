import { parseLightdashClient } from './clientHeader';

describe('parseLightdashClient', () => {
    it.each([
        ['ios/1.0.1+198', 'ios', '1.0.1', '198'],
        ['android/1.1.0+45', 'android', '1.1.0', '45'],
        ['web/0.1234.0', 'web', '0.1234.0', null],
        ['android/1.4.0 (123)', 'android', '1.4.0', '123'],
        [' IOS/1.0.1+198 ', 'ios', '1.0.1', '198'],
    ])('parses %s', (header, client, clientVersion, clientBuild) => {
        expect(
            parseLightdashClient({ header, userAgent: 'Mozilla/5.0' }),
        ).toEqual({ client, clientVersion, clientBuild });
    });

    it.each([
        ['Mozilla/5.0', 'web'],
        ['okhttp/4.0', 'android'],
        ['test Dalvik/2.0', 'android'],
        ['app CFNetwork/123', 'ios'],
        ['app Darwin/24', 'ios'],
        [undefined, 'unknown'],
        ['custom/1.0', 'unknown'],
    ])('falls back to user agent %s', (userAgent, client) => {
        expect(parseLightdashClient({ header: undefined, userAgent })).toEqual({
            client,
            clientVersion: null,
            clientBuild: null,
        });
    });

    it.each([
        '<script>',
        'x'.repeat(129),
        'ios/',
        '/1.0',
        'ios/☃',
        'ios/1.0+☃',
        'ios/1.0 trailing',
        `ios/${'a'.repeat(65)}`,
        `${'a'.repeat(33)}/1`,
        `ios/1+${'a'.repeat(33)}`,
    ])('rejects malformed headers without throwing', (header) => {
        expect(parseLightdashClient({ header, userAgent: undefined })).toEqual({
            client: 'unknown',
            clientVersion: null,
            clientBuild: null,
        });
        expect(
            parseLightdashClient({ header, userAgent: 'Mozilla/5.0' }).client,
        ).toBe('web');
    });

    it('limits the user agent before matching', () => {
        expect(
            parseLightdashClient({
                header: undefined,
                userAgent: `${'x'.repeat(512)}CFNetwork/1`,
            }).client,
        ).toBe('unknown');
    });
});
