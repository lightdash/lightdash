import { generateSlug } from './utils/slugs';

describe('Slug', () => {
    test('should generate space slugs', async () => {
        expect(generateSlug('my space name')).toEqual('my-space-name');

        expect(generateSlug('my space name')).toEqual('my-space-name');

        expect(
            generateSlug('a_SPACE_NAME.with!special?chars/and\\slashes'),
        ).toEqual('a-space-name-with-special-chars-and-slashes');

        expect(generateSlug('!trim_special_chars!')).toEqual(
            'trim-special-chars',
        );
    });

    test('should generate chart slugs', async () => {
        expect(
            generateSlug('a CHART_NAME.with!special?chars/and\\slashes'),
        ).toEqual('a-chart-name-with-special-chars-and-slashes');
    });

    test('should generate dashboard slugs', async () => {
        expect(generateSlug('my dashboard name')).toEqual('my-dashboard-name');

        expect(
            generateSlug('a DASHBOARD_NAME.with!special?chars/and\\slashes'),
        ).toEqual('a-dashboard-name-with-special-chars-and-slashes');
    });

    test('should handle emojis and special characters properly', () => {
        expect(
            generateSlug(':control_knobs: Usage Dashboard (demo Swappie)'),
        ).toEqual('usage-dashboard-demo-swappie');

        // Test multiple emojis and special characters
        expect(generateSlug('🎉 Party 🎊 Time! 🎈 (Special Event)')).toEqual(
            'party-time-special-event',
        );

        // Test emoji at the end
        expect(generateSlug('My Dashboard 🚀')).toEqual('my-dashboard');

        // Ensure backwards compatibility with existing test cases
        expect(generateSlug('my dashboard name')).toEqual('my-dashboard-name');
        expect(generateSlug('!special.chars!')).toEqual('special-chars');
    });
});
