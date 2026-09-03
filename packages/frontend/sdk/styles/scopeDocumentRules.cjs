/**
 * PostCSS plugin for the SDK's CSS pipeline. The SDK bundles the same
 * stylesheets as the app (Mantine's `styles.css`, our `global.css`, third-party
 * CSS), and those legitimately style `html`, `body`, `*`, `input`, `p`... In the
 * app that is the document; inside a customer's page it is their markup.
 *
 * Any selector that has no class, attribute or id component is rewritten to
 * apply inside the SDK's containers instead:
 *   `:root`, `:host`, `html`, `body`  ->  `.lightdash-sdk-scope`
 *   `*`, `input`, `p`, `::selection`  ->  `:where(.lightdash-sdk-scope) *`, ...
 * `:where()` keeps element rules at their original specificity, so Mantine's
 * component classes still beat them exactly as they do in the app.
 */
const DEFAULT_SCOPE_CLASS = 'lightdash-sdk-scope';

const DOCUMENT_ROOTS = new Set([':root', ':host', 'html', 'body']);

const matchesOwnMarkupOnly = (selector) => /[.[#]/.test(selector);

const scopeSelector = (selector, scopeClass) => {
    const trimmed = selector.trim();
    if (matchesOwnMarkupOnly(trimmed)) {
        return trimmed;
    }
    if (DOCUMENT_ROOTS.has(trimmed)) {
        return `.${scopeClass}`;
    }
    return `:where(.${scopeClass}) ${trimmed}`;
};

const isKeyframeStep = (rule) =>
    rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name);

/** @param {{ scopeClass?: string }} [options] */
const scopeDocumentRules = (options = {}) => {
    const scopeClass = options.scopeClass ?? DEFAULT_SCOPE_CLASS;
    return {
        postcssPlugin: 'lightdash-sdk-scope-document-rules',
        Rule(rule) {
            if (isKeyframeStep(rule)) {
                return;
            }
            const scoped = rule.selectors.map((selector) =>
                scopeSelector(selector, scopeClass),
            );
            rule.selectors = [...new Set(scoped)];
        },
    };
};

scopeDocumentRules.postcss = true;
scopeDocumentRules.DEFAULT_SCOPE_CLASS = DEFAULT_SCOPE_CLASS;

module.exports = scopeDocumentRules;
