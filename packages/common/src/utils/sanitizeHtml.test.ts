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
        ).toEqual('<img src="https://google.com" width="400" height="300" />');

        expect(
            sanitizeHtml(
                '<style>body { content: "hello this is ur bank"; }</style>',
                HTML_SANITIZE_MARKDOWN_TILE_RULES,
            ),
        ).toEqual('');
    });

    test('style tag in span is preserved', () => {
        expect(
            sanitizeHtml('<span style="color:red;font-size:24px">@Foo</span>'),
        ).toEqual('<span style="color:red;font-size:24px">@Foo</span>');
    });

    test('style tag in paragraph is discarded', () => {
        expect(
            sanitizeHtml('<p style="color:red;font-size:24px">@Foo</p>'),
        ).toEqual('<p>@Foo</p>');
    });

    test('valid tag with surrounding + inner text', () => {
        expect(
            sanitizeHtml('Here is some text <p>And a paragraph.</p><br />'),
        ).toEqual('Here is some text <p>And a paragraph.</p><br />');
    });

    test('double sanitization (with invalid tags)', () => {
        expect(
            sanitizeHtml(
                sanitizeHtml(
                    '<script>console.log("boo");</script><p><span style="color: red">@Foo</span></p>',
                ),
            ),
        ).toEqual('<p><span style="color:red">@Foo</span></p>');
    });

    test('malformed tag', () => {
        expect(sanitizeHtml('<span style="color:red">@Foo')).toEqual(
            '<span style="color:red">@Foo</span>',
        );
    });
});
