import {
    generateSlug,
    getContentAsCodePathFromLtreePath,
    getDeepestPaths,
    getLtreePathFromContentAsCodePath,
    getLtreePathFromSlug,
    isSubPath,
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

describe('getDeepestPaths', () => {
    test('should return the deepest paths', () => {
        expect(
            getDeepestPaths([
                'dash',
                'charts',
                'charts2',
                'charts2.charts2_child',
            ]),
        ).toEqual(['dash', 'charts', 'charts2.charts2_child']);

        expect(
            getDeepestPaths([
                'jaffle_shop.dashboards.dashboards_marketing',
                'jaffle_shop.sub_charts_2.sub_charts_2_child',
                'jaffle_shop.dashboards',
                'jaffle_shop.sub_charts',
                'jaffle_shop.sub_charts_2',
            ]),
        ).toEqual([
            'jaffle_shop.dashboards.dashboards_marketing',
            'jaffle_shop.sub_charts_2.sub_charts_2_child',
            'jaffle_shop.sub_charts',
        ]);

        expect(
            getDeepestPaths([
                'a.b.c.d',
                'a.b.c',
                'a.b.c.d.e',
                'a.b.c.d.e.f',
                'a.b.c.d.e.f.g',
                'a.b.c.d.e.f.g.h',
                'a.b.c.d.e.f.g.h.i',
                'foo',
                'bar',
            ]),
        ).toEqual(['a.b.c.d.e.f.g.h.i', 'foo', 'bar']);

        expect(getDeepestPaths(['a'])).toEqual(['a']);

        expect(getDeepestPaths(['a', 'b'])).toEqual(['a', 'b']);
    });
});

describe('isSubpath', () => {
    test('should return true if the path is a subpath of the other path', () => {
        expect(isSubPath('a.b.c', 'a.b')).toEqual(false);
        expect(isSubPath('a.b.c', 'a.b.c')).toEqual(false);
        expect(isSubPath('a.b.c', 'a.b.c.d')).toEqual(true);
        expect(isSubPath('a', 'a')).toEqual(false);
        expect(isSubPath('a', 'a.b')).toEqual(true);
    });
});
