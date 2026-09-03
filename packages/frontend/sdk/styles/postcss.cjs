/**
 * PostCSS setup for the SDK's CSS pipeline. The SDK bundles the same
 * stylesheets as the app (Mantine's `styles.css`, our `global.css`, third-party
 * CSS) into a customer's page. Every rule is rewritten to apply only inside the
 * SDK's containers:
 *   `:root`, `:host`, `html`, `body`  ->  `.lightdash-sdk-scope`
 *   `[data-mantine-color-scheme=…]`   ->  `.lightdash-sdk-scope[data-mantine-color-scheme=…]`
 *   everything else                   ->  `:where(.lightdash-sdk-scope) <selector>`
 * `:where()` adds no specificity, so the cascade inside the embed is exactly
 * the app's. The scheme rewrite matters when the host runs Mantine too: its
 * attribute sits on <html>, an ancestor of everything, and must not drive our
 * rules.
 */
const prefixSelector = require('postcss-prefix-selector');
// Shared with the runtime (sdk/index.tsx) through JSON so every toolchain reads it.
const { SDK_SCOPE_CLASS } = require('./scope.json');
const SDK_SCOPE_SELECTOR = `.${SDK_SCOPE_CLASS}`;

const SCHEME_ATTRIBUTE = /(:root|:host)?\[data-mantine-color-scheme/g;
const DOCUMENT_ROOT = /^(:root|:host|html|body)$/;

const scopeDocumentRules = prefixSelector({
    prefix: SDK_SCOPE_SELECTOR,
    transform: (prefix, selector) => {
        if (SCHEME_ATTRIBUTE.test(selector)) {
            return selector.replace(
                SCHEME_ATTRIBUTE,
                `${prefix}[data-mantine-color-scheme`,
            );
        }
        if (selector.includes(prefix)) {
            return selector;
        }
        return DOCUMENT_ROOT.test(selector)
            ? prefix
            : `:where(${prefix}) ${selector}`;
    },
});

module.exports = { scopeDocumentRules };
