import {
    generateSlug,
    getLabelFromSlug,
    getParentSlug,
    getSlugsWithHierarchy,
} from './slugs';

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
        // Test multiple emojis and special characters
        expect(generateSlug('🎉 Party 🎊 Time! 🎈 (Special Event)')).toEqual(
            'party-time-special-event',
        );

        // Test emoji at the end
        expect(generateSlug('My Dashboard 🚀')).toEqual('my-dashboard');

        // Ensure backwards compatibility with existing test cases
        expect(generateSlug('my dashboard name')).toEqual('my-dashboard-name');
        expect(generateSlug('!special.chars!')).toEqual('special-chars');

        // Test Unicode emojis
        expect(generateSlug('📊 Analytics Dashboard 👨‍💻')).toEqual(
            'analytics-dashboard',
        );

        // Handle japanese characters
        expect(generateSlug('Lightdashライトダッシュ')).toEqual('lightdash');

        // Return short slug (but not empty) if all characters are special
        expect(generateSlug('LDライトダッシュ')).toEqual('ld');
        expect(generateSlug('!"·$%&0!"·$%')).toEqual('0');
        expect(generateSlug('x!!!!')).toEqual('x');
    });

    test('if all slug are special characters, return a 5 char random string', () => {
        expect(generateSlug('!!!!').length).toEqual(5);

        // Test multiple emojis andspecial characters
        expect(generateSlug('🎉🎊').length).toEqual(5);

        // Handle japanese characters
        expect(generateSlug('ライトダッシュ').length).toEqual(5);
    });

    describe('getSlugsWithHierarchy', () => {
        test('should return array with single slug for non-hierarchical slug', () => {
            expect(getSlugsWithHierarchy('my-space')).toEqual(['my-space']);
        });

        test('should return array with hierarchical slugs', () => {
            expect(getSlugsWithHierarchy('parent-space/child-space')).toEqual([
                'parent-space',
                'parent-space/child-space',
            ]);
        });

        test('should handle multiple levels of hierarchy', () => {
            expect(
                getSlugsWithHierarchy(
                    'grandparent-space/parent-space/child-space',
                ),
            ).toEqual([
                'grandparent-space',
                'grandparent-space/parent-space',
                'grandparent-space/parent-space/child-space',
            ]);
        });
    });

    describe('getParentSlug', () => {
        test('should return empty string for non-hierarchical slug', () => {
            expect(getParentSlug('my-space')).toEqual('');
        });

        test('should return parent slug for hierarchical slug', () => {
            expect(getParentSlug('parent-space/child-space')).toEqual(
                'parent-space',
            );
        });

        test('should return parent path for deeply nested slug', () => {
            expect(
                getParentSlug('grandparent-space/parent-space/child-space'),
            ).toEqual('grandparent-space/parent-space');
        });
    });

    describe('getLabelFromSlug', () => {
        test('should return same slug for non-hierarchical slug', () => {
            expect(getLabelFromSlug('my-space')).toEqual('my-space');
        });

        test('should return last part of hierarchical slug', () => {
            expect(getLabelFromSlug('parent-space/child-space')).toEqual(
                'child-space',
            );
        });

        test('should return last part of deeply nested slug', () => {
            expect(
                getLabelFromSlug('grandparent-space/parent-space/child-space'),
            ).toEqual('child-space');
        });
    });
});
