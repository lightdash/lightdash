/**
 * PostCSS setup for the SDK's CSS pipeline. The SDK bundles the same
 * stylesheets as the app (Mantine's `styles.css`, our `global.css`, third-party
 * CSS) into a customer's page, where `html`, `body`, `*`, `input`, `p`... would
 * restyle their markup. Selectors with a class, attribute or id already only
 * match markup we render and are left alone; document roots become the SDK
 * container; everything else is wrapped in `:where()` so element rules keep the
 * specificity they have in the app and Mantine's component classes still win.
 */
const prefixSelector = require('postcss-prefix-selector');

const SCOPE_SELECTOR = '.lightdash-sdk-scope';

const SCHEME_ATTRIBUTE = /(:root|:host)?\[data-mantine-color-scheme/g;

const scopeDocumentRules = prefixSelector({
    prefix: SCOPE_SELECTOR,
    transform: (prefix, selector) => {
        if (SCHEME_ATTRIBUTE.test(selector)) {
            return selector.replace(
                SCHEME_ATTRIBUTE,
                `${prefix}[data-mantine-color-scheme`,
            );
        }
        if (/[.[#]/.test(selector)) {
            return selector;
        }
        return /^(:root|:host|html|body)$/.test(selector)
            ? prefix
            : `:where(${prefix}) ${selector}`;
    },
});

module.exports = { scopeDocumentRules, SCOPE_SELECTOR };
