import sanitize from 'sanitize-html';

/**
 * A list of tags for which style attributes are allowed, but only
 * for attributes commonly useful for text styling (e.g centering text,
 * changing colors, etc).
 */
const tagNamesAllowingTextStyling = [
    'div',
    'nav',
    'img',
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

const colorRegexes = [
    /^[a-zA-Z]+$/, // Color names: red, blue, green, etc.
    /^#[0-9a-fA-F]{3}$/, // Hex colors: #000 Note: we don't allow alpha hex colors (4 digits)
    /^#[0-9a-fA-F]{6}$/, // Hex colors: #000000 Note: we don't allow alpha hex colors (8 digits)
    /^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/, // RGB colors: rgb(0, 0, 0) Note: we don't allow rgba
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
    color: colorRegexes,
    'background-color': colorRegexes,
    background: [...colorRegexes, /^transparent$/, /^none$/],
    'border-radius': [/^(\d+(?:px|em|rem|%))(\s+\d+(?:px|em|rem|%))*$/],
    'border-top-left-radius': [/^\d+(?:px|em|rem|%)$/],
    'border-top-right-radius': [/^\d+(?:px|em|rem|%)$/],
    'border-bottom-left-radius': [/^\d+(?:px|em|rem|%)$/],
    'border-bottom-right-radius': [/^\d+(?:px|em|rem|%)$/],
    height: [/^\d+(?:px|em|rem|%)$/, /^auto$/],
    width: [/^\d+(?:px|em|rem|%)$/, /^auto$/],
    'max-width': [/^\d+(?:px|em|rem|%)$/, /^none$/],
    'max-height': [/^\d+(?:px|em|rem|%)$/, /^none$/],
    'min-width': [/^\d+(?:px|em|rem|%)$/],
    'min-height': [/^\d+(?:px|em|rem|%)$/],
    'object-fit': [/^(?:fill|contain|cover|none|scale-down)$/],
    margin: [/^(\d+(?:px|em|rem|%))(\s+\d+(?:px|em|rem|%))*$/],
    'margin-bottom': [/^\d+(?:px|em|rem|%)$/],
    'margin-top': [/^\d+(?:px|em|rem|%)$/],
    'margin-left': [/^\d+(?:px|em|rem|%)$/],
    'margin-right': [/^\d+(?:px|em|rem|%)$/],
    padding: [/^(\d+(?:px|em|rem|%))(\s+\d+(?:px|em|rem|%))*$/],
    'padding-bottom': [/^\d+(?:px|em|rem|%)$/],
    'padding-top': [/^\d+(?:px|em|rem|%)$/],
    'padding-left': [/^\d+(?:px|em|rem|%)$/],
    'padding-right': [/^\d+(?:px|em|rem|%)$/],
    float: [/^(?:left|right|none)$/],
    clear: [/^(?:left|right|both|none)$/],
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

const percentRegex = /^\d+(?:\.\d+)?%$/;
const tileAttributes =
    HTML_SANITIZE_MARKDOWN_TILE_RULES.allowedAttributes || {};

/**
 * Rules for lesson HTML published by Lightdash University. Lessons carry
 * citation pins (`a.cit` → `#fig-…`) and highlight boxes positioned by
 * percentage over a figure; scripts and stylesheets are still dropped.
 */
export const HTML_SANITIZE_LEARN_LESSON_RULES: sanitize.IOptions = {
    ...HTML_SANITIZE_MARKDOWN_TILE_RULES,
    // Lessons never embed frames; a compromised content host must not either.
    allowedTags: (HTML_SANITIZE_MARKDOWN_TILE_RULES.allowedTags || []).filter(
        (tag) => tag !== 'iframe',
    ),
    allowedAttributes: {
        ...Object.fromEntries(
            Object.entries(tileAttributes).filter(([tag]) => tag !== 'iframe'),
        ),
        a: [...(tileAttributes.a ?? []), 'class', 'data-hl'],
        span: [
            ...(tileAttributes.span ?? []),
            'class',
            'id',
            'data-r',
            'data-label',
        ],
        figure: ['class', 'id'],
        img: [...(tileAttributes.img ?? []), 'class'],
        div: [...(tileAttributes.div ?? []), 'data-demo'],
    },
    allowedStyles: {
        ...HTML_SANITIZE_MARKDOWN_TILE_RULES.allowedStyles,
        span: {
            ...allowedTextStylingProperties,
            left: [percentRegex],
            top: [percentRegex],
            width: [...allowedTextStylingProperties.width, percentRegex],
            height: [...allowedTextStylingProperties.height, percentRegex],
        },
    },
};

export const sanitizeHtml = (
    input: string,
    ruleSet: sanitize.IOptions = HTML_SANITIZE_DEFAULT_RULES,
): string => sanitize(input, ruleSet);
