import {
    generateSlug,
    getContentAsCodePathFromLtreePath,
    getLtreePathFromContentAsCodePath,
    getLtreePathFromSlug,
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

    describe('getLtreePathFromSlug', () => {
        test('should return ltree path from slug', () => {
            expect(getLtreePathFromSlug('my-space')).toEqual('my_space');
        });

        test('should return ltree path from legacy hierarchical slug', () => {
            expect(getLtreePathFromSlug('parent-space/child-space')).toEqual(
                'parent_space___child_space',
            );
        });

        test('should not trim hyphens from slug', () => {
            expect(
                getLtreePathFromSlug('-my-space-name-with-hyphens-'),
            ).toEqual('_my_space_name_with_hyphens_');
        });

        test('should not trim hyphens from deeply nested slug', () => {
            expect(
                getLtreePathFromSlug(
                    'grandparent-space-/-parent-space/child-space-',
                ),
            ).toEqual('grandparent_space_____parent_space___child_space_');
        });
    });
});

describe('getLtreePathFromContentAsCodePath', () => {
    test('root', () => {
        expect(getLtreePathFromContentAsCodePath('my-space')).toEqual(
            'my_space',
        );
    });
    test('nested', () => {
        expect(
            getLtreePathFromContentAsCodePath(
                'parent/child/-grandchild/final-child',
            ),
        ).toEqual('parent.child._grandchild.final_child');
        expect(getLtreePathFromContentAsCodePath('-parent-/-child-')).toEqual(
            '_parent_._child_',
        );
    });

    test('new slugs', () => {
        expect(
            getLtreePathFromContentAsCodePath(
                '-foo/-foo___bar/-foo___bar___boo',
            ),
        ).toEqual('_foo._foo___bar._foo___bar___boo');
    });
});

describe('getContentAsCodePathFromLtreePath', () => {
    test('root', () => {
        expect(getContentAsCodePathFromLtreePath('my_space')).toEqual(
            'my-space',
        );
        expect(getContentAsCodePathFromLtreePath('_my_space')).toEqual(
            '-my-space',
        );
    });

    test('nested', () => {
        expect(
            getContentAsCodePathFromLtreePath(
                'parent.child._grandchild.final_child',
            ),
        ).toEqual('parent/child/-grandchild/final-child');
    });

    test('new slugs', () => {
        expect(
            getContentAsCodePathFromLtreePath(
                '_foo._foo___bar._foo___bar___boo',
            ),
        ).toEqual('-foo/-foo---bar/-foo---bar---boo');
    });
});

describe('getContentAsCodePathFromLtreePath + getLtreePathFromContentAsCodePath', () => {
    test('should be the inverse of each other', () => {
        expect(
            getContentAsCodePathFromLtreePath(
                getLtreePathFromContentAsCodePath('my-space'),
            ),
        ).toEqual('my-space');

        expect(
            getLtreePathFromContentAsCodePath(
                getContentAsCodePathFromLtreePath('__my_space_'),
            ),
        ).toEqual('__my_space_');

        expect(
            getLtreePathFromContentAsCodePath(
                getContentAsCodePathFromLtreePath('__my_space_.foo.bar'),
            ),
        ).toEqual('__my_space_.foo.bar');
    });
});
