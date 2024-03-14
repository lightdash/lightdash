import { sanitizeHtml } from './sanitizeHtml';

describe('sanitizeHtml', () => {
    test('empty input', () => {
        expect(sanitizeHtml('')).toEqual('');
    });

    test('no html tags', () => {
        expect(sanitizeHtml('Hello this is just some text')).toEqual(
            'Hello this is just some text',
        );
    });

    test('script tag (discard)', () => {
        expect(sanitizeHtml('<script>console.log("sup");</script>')).toEqual(
            '',
        );
    });

    test('script tag with neighboring text', () => {
        expect(
            sanitizeHtml('<script>console.log("sup");</script> Some text'),
        ).toEqual(' Some text');
    });

    test('valid tag', () => {
        expect(
            sanitizeHtml('<a href="https://www.lightdash.com/">Lightdash</a>'),
        ).toEqual('<a href="https://www.lightdash.com/">Lightdash</a>');
    });

    test('valid tag with surrounding + inner text', () => {
        expect(
            sanitizeHtml('Here is some text <p>And a paragraph.</p><br />'),
        ).toEqual('Here is some text <p>And a paragraph.</p><br />');
    });
});
