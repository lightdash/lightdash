import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { SDK_SCOPE_CLASS } from './scope';
import scopeDocumentRules from './scopeDocumentRules.cjs';

const transform = (css: string) =>
    postcss([scopeDocumentRules()]).process(css, { from: undefined }).css;

describe('scopeDocumentRules', () => {
    it('defaults to the class the SDK puts on its containers', () => {
        expect(scopeDocumentRules.DEFAULT_SCOPE_CLASS).toBe(SDK_SCOPE_CLASS);
    });

    it('moves document roots onto the scope class', () => {
        expect(transform(':root, :host { --x: 1 }')).toBe(
            '.lightdash-sdk-scope { --x: 1 }',
        );
        expect(transform('html, body { margin: 0 }')).toBe(
            '.lightdash-sdk-scope { margin: 0 }',
        );
    });

    it('scopes element and universal selectors without raising specificity', () => {
        expect(transform('*, *::before { box-sizing: border-box }')).toBe(
            ':where(.lightdash-sdk-scope) *, :where(.lightdash-sdk-scope) *::before { box-sizing: border-box }',
        );
        expect(transform('input, button { font: inherit }')).toBe(
            ':where(.lightdash-sdk-scope) input, :where(.lightdash-sdk-scope) button { font: inherit }',
        );
        expect(transform('::selection { color: red }')).toBe(
            ':where(.lightdash-sdk-scope) ::selection { color: red }',
        );
    });

    it('leaves selectors that already target our own markup alone', () => {
        const css = [
            '.m_abc { color: red }',
            ':where([data-mantine-color-scheme="dark"]) .m_abc { color: blue }',
            'fieldset:disabled .mantine-active:active { transform: none }',
            '#embed-scroll-container { height: auto }',
        ].join('\n');
        expect(transform(css)).toBe(css);
    });

    it('handles nested at-rules and skips keyframe steps', () => {
        expect(
            transform(
                '@media print { body { color: red } }\n@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }',
            ),
        ).toBe(
            '@media print { .lightdash-sdk-scope { color: red } }\n@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }',
        );
    });

    it('is idempotent', () => {
        const once = transform('body { margin: 0 } p { margin: 0 }');
        expect(transform(once)).toBe(once);
    });
});
