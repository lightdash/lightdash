import { generateSlug } from './utils/slugs';

describe('Slug', () => {
    // TODO mock some timezones
    test('should generate space slugs', async () => {
        expect(generateSlug('spaces', 'my space name')).toEqual(
            'spaces/my-space-name',
        );

        expect(
            generateSlug(
                'spaces',
                'my space name',
                'ignored space name', // space name
            ),
        ).toEqual('spaces/my-space-name');

        expect(
            generateSlug(
                'spaces',
                'a_SPACE_NAME.with!special?chars/and\\slashes',
            ),
        ).toEqual('spaces/a-space-name-with-special-chars-and-slashes');

        expect(generateSlug('spaces', '!trim_special_chars!')).toEqual(
            'spaces/trim-special-chars',
        );
    });

    test('should generate chart slugs', async () => {
        expect(() =>
            generateSlug(
                'charts',
                'my space name',
                undefined, // chart without space
            ),
        ).toThrowError(Error);

        expect(generateSlug('charts', 'my chart name', 'space name')).toEqual(
            'charts/space-name/my-chart-name',
        );

        expect(
            generateSlug(
                'charts',
                'a CHART_NAME.with!special?chars/and\\slashes',
                'a_SPACE_NAME.with!special?chars/and\\slashes',
            ),
        ).toEqual(
            'charts/a-space-name-with-special-chars-and-slashes/a-chart-name-with-special-chars-and-slashes',
        );
    });

    test('should generate dashboard slugs', async () => {
        expect(() =>
            generateSlug(
                'dashboards',
                'my space name',
                undefined, // chart without space
            ),
        ).toThrowError(Error);

        expect(
            generateSlug('dashboards', 'my dashboard name', 'space name'),
        ).toEqual('dashboards/space-name/my-dashboard-name');

        expect(
            generateSlug(
                'dashboards',
                'a DASHBOARD_NAME.with!special?chars/and\\slashes',
                'a_SPACE_NAME.with!special?chars/and\\slashes',
            ),
        ).toEqual(
            'dashboards/a-space-name-with-special-chars-and-slashes/a-dashboard-name-with-special-chars-and-slashes',
        );
    });
});
