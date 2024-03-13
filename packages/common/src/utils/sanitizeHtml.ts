import sanitize from 'sanitize-html';

/**
 * If you want to modify sanitization settings, be sure to merge them
 * with the sane defaults pre-included with sanitize-html.
 */
const HTML_SANITIZE_OPTIONS: sanitize.IOptions = {
    ...sanitize.defaults,

    allowedAttributes: {
        ...sanitize.defaults.allowedAttributes,
        // Allow @mentions to be styled differently:
        span: [...(sanitize.defaults.allowedAttributes.span ?? []), 'style'],
    },
};

export const sanitizeHtml = (input: string): string =>
    sanitize(input, HTML_SANITIZE_OPTIONS);
