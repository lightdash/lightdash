import sanitize from 'sanitize-html';

/**
 * A list of tags for which style attributes are allowed, but only
 * for attributes commonly useful for text styling (e.g centering text,
 * changing colors, etc).
 */
const tagNamesAllowingTextStyling = [
    'span', // Also required for comment @mentions to be styled appropriately
    'a',
    'p',
    'b',
    'strong',
    'em',
    'i',
    'td',
    'code',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
];

/**
 * Defines a list of CSS properties and value RegExps, which will be allowed as part of the
 * style attribute in the above tags.
 */
const allowedTextStylingProperties: NonNullable<
    sanitize.IOptions['allowedStyles']
>[string] = {
    'font-size': [/^\d+(?:px|em|rem|%)$/], // 12px, 1em, 20%
    'font-style': [/^(?:normal|italic|oblique)$/, /^oblique \d+deg$/], //  normal, italic, oblique, oblique 10deg
    'font-weight': [/^\d+$/, /^(?:normal|bold|lighter|bolder)$/], //  100, 500, normal, bold, lighter, bolder
    'line-height': [/^\d+(?:px|em|rem|%)$/], // 1.5, 20px, 120%
    'letter-spacing': [/^\d+(?:px|em|rem|%)$/], // 1px, 0.2em, 10%
    'word-spacing': [/^\d+(?:px|em|rem|%)$/], // 1px, 0.2em, 10%
    'text-align': [/^(?:left|right|center|justify)$/], //  left, right, center, justify
    'text-decoration': [/^(?:none|underline|overline|line-through)$/], //  none, underline, overline, line-through
    color: [
        /^[a-zA-Z]+$/, // Color names: red, blue, green, etc.
        /^#[0-9a-fA-F]{3}$/, // Hex colors: #000 Note: we don't allow alpha hex colors (4 digits)
        /^#[0-9a-fA-F]{6}$/, // Hex colors: #000000 Note: we don't allow alpha hex colors (8 digits)
        /^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/, // RGB colors: rgb(0, 0, 0) Note: we don't allow rgba
    ],
};

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

        ...Object.fromEntries(
            tagNamesAllowingTextStyling.map((tagName) => [
                tagName,
                [
                    /** Include any existing allowed attributes from the sanitize-html defaults: */
                    ...(sanitize.defaults.allowedAttributes[tagName] ?? []),
                    'style',
                ],
            ]),
        ),
    },

    allowedStyles: Object.fromEntries(
        tagNamesAllowingTextStyling.map((tagName) => [
            tagName,
            allowedTextStylingProperties,
        ]),
    ),
};

export const sanitizeHtml = (
    input: string,
    ruleSet: sanitize.IOptions = HTML_SANITIZE_DEFAULT_RULES,
): string => sanitize(input, ruleSet);
