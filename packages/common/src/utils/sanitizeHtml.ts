import sanitize from 'sanitize-html';

/**
 * If you want to modify sanitization settings, be sure to merge them
 * with the sane defaults pre-included with sanitize-html.
 */
const HTML_SANITIZE_OPTIONS: sanitize.IOptions = sanitize.defaults;

export const sanitizeHtml = (input: string): string =>
    sanitize(input, HTML_SANITIZE_OPTIONS);
