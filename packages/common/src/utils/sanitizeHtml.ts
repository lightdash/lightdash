import sanitize from 'sanitize-html';

/**
 * If you want to modify sanitization settings, be sure to merge them
 * with the sane defaults pre-included with sanitize-html.
 */
export const HTML_SANITIZE_DEFAULT_RULES: sanitize.IOptions = {
    ...sanitize.defaults,

    allowedAttributes: {
        ...sanitize.defaults.allowedAttributes,
        // Allow @mentions to be styled differently:
        span: [...(sanitize.defaults.allowedAttributes.span ?? []), 'style'],
    },
};

/**
 * Adjusted html sanitization rules for markdown tiles, mainly to
 * allow iframes to be used.
 */
export const HTML_SANITIZE_MARKDOWN_TILE_RULES: sanitize.IOptions = {
    ...HTML_SANITIZE_DEFAULT_RULES,
    allowedTags: [
        ...(HTML_SANITIZE_DEFAULT_RULES.allowedTags || []),
        'iframe',
        'img',
    ],
    allowedAttributes: {
        ...HTML_SANITIZE_DEFAULT_RULES.allowedAttributes,
        iframe: ['width', 'height', 'src', 'name'],
        img: ['src', 'width', 'height', 'alt', 'style'],
    },
};

export const sanitizeHtml = (
    input: string,
    ruleSet: sanitize.IOptions = HTML_SANITIZE_DEFAULT_RULES,
): string => sanitize(input, ruleSet);
