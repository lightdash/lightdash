import {
    HTML_SANITIZE_MARKDOWN_TILE_RULES,
    sanitizeHtml,
} from './sanitizeHtml';

describe('sanitizeHtml', () => {
    test('empty input', () => {
        expect(sanitizeHtml('')).toEqual('');
    });

    test('no html tags in input', () => {
        expect(sanitizeHtml('Hello this is just some text')).toEqual(
            'Hello this is just some text',
        );
    });

    test('script tag is discarded', () => {
        expect(sanitizeHtml('<script>console.log("sup");</script>')).toEqual(
            '',
        );
    });

    test('script tag with neighboring text is discarded', () => {
        expect(
            sanitizeHtml('<script>console.log("sup");</script> Some text'),
        ).toEqual(' Some text');
    });

    test('valid tag is preserved', () => {
        expect(
            sanitizeHtml('<a href="https://www.lightdash.com/">Lightdash</a>'),
        ).toEqual('<a href="https://www.lightdash.com/">Lightdash</a>');
    });

    test('style tag in paragraph is discarded', () => {
        expect(
            sanitizeHtml('<p style="color:red;font-size:24px">@Foo</p>'),
        ).toEqual('<p>@Foo</p>');
    });

    describe('as part of markdown tiles', () => {
        test('markdown tile rule set', () => {
            expect(
                sanitizeHtml(
                    '<iframe src="https://google.com" width=400 height="300"></iframe>',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual(
                '<iframe src="https://google.com" width="400" height="300"></iframe>',
            );

            expect(
                sanitizeHtml(
                    '<img src="https://google.com" width=400 height="300" />',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual(
                '<img src="https://google.com" width="400" height="300" />',
            );

            expect(
                sanitizeHtml(
                    '<style>body { content: "hello this is ur bank"; }</style>',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual('');
        });

        test('style tag in span is preserved', () => {
            expect(
                sanitizeHtml(
                    '<span style="color:red;font-size:24px">@Foo</span>',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual('<span style="color:red;font-size:24px">@Foo</span>');
        });

        test('valid tag with surrounding + inner text', () => {
            expect(
                sanitizeHtml(
                    'Here is some text <p>And a paragraph.</p><br />',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual('Here is some text <p>And a paragraph.</p><br />');
        });

        test('double sanitization (with invalid tags)', () => {
            expect(
                sanitizeHtml(
                    sanitizeHtml(
                        '<script>console.log("boo");</script><p><span style="color: red">@Foo</span></p>',
                        HTML_SANITIZE_MARKDOWN_TILE_RULES,
                    ),
                ),
            ).toEqual('<p><span style="color:red">@Foo</span></p>');
        });

        test('malformed tag', () => {
            expect(
                sanitizeHtml(
                    '<span style="color:red">@Foo',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual('<span style="color:red">@Foo</span>');
        });

        test('valid style attribute in allowed tags', () => {
            const allowedTags = [
                '<span style="color:red">Text</span>',
                '<a href="#" style="font-size:16px">Link</a>',
                '<p style="font-weight:bold">Paragraph</p>',
            ];

            allowedTags.forEach((tag) => {
                expect(
                    sanitizeHtml(tag, HTML_SANITIZE_MARKDOWN_TILE_RULES),
                ).toEqual(tag);
            });
        });

        test('invalid style attributes in allowed tags', () => {
            const invalidTags = [
                [
                    '<span style="background-image:url(\'https://example.com/image.jpg\');">Text</span>',
                    '<span>Text</span>',
                ],
                [
                    '<a href="#" style="border:1px solid black">Link</a>',
                    '<a href="#">Link</a>',
                ],
                [
                    '<p style="text-align:right;background: red;">Paragraph</p>',
                    '<p style="text-align:right">Paragraph</p>',
                ],
                [
                    '<p style="color:rgba(1,1,1,0)">Paragraph</p>',
                    '<p>Paragraph</p>',
                ],
                ['<p style="color:#0000">Paragraph</p>', '<p>Paragraph</p>'],
                [
                    '<p style="color:#00000000">Paragraph</p>',
                    '<p>Paragraph</p>',
                ],
            ];

            invalidTags.forEach(([tag, expected]) => {
                expect(
                    sanitizeHtml(tag, HTML_SANITIZE_MARKDOWN_TILE_RULES),
                ).toEqual(expected);
            });
        });

        test('valid style attribute in allowed tags with multiple styles', () => {
            const tag = '<span style="color:red;font-weight:bold">Text</span>';
            expect(
                sanitizeHtml(tag, HTML_SANITIZE_MARKDOWN_TILE_RULES),
            ).toEqual(tag);
        });

        test('invalid style attributes in allowed tags with multiple styles', () => {
            expect(
                sanitizeHtml(
                    `<span style="color:red;font-weight:bold;text-align:right;background: url('foo.jpg')">Text</span>`,
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual(
                '<span style="color:red;font-weight:bold;text-align:right">Text</span>',
            );
        });

        test('style attributes in disallowed tags', () => {
            const disallowedTags = [
                ['<div style="color:red;">Text</div>', '<div>Text</div>'],
                [
                    '<table style="border:1px solid black;"><tr><td>Cell</td></tr></table>',
                    '<table><tr><td>Cell</td></tr></table>',
                ],
            ];

            disallowedTags.forEach(([tag, expected]) => {
                expect(
                    sanitizeHtml(tag, HTML_SANITIZE_MARKDOWN_TILE_RULES),
                ).toEqual(expected);
            });
        });
    });
});
