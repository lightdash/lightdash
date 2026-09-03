import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { scopeDocumentRules } from './postcss.cjs';
import { SDK_SCOPE_CLASS } from './scope.json';

// Every stylesheet the SDK entry imports is injected into the customer's page.
// After scoping, every rule must be confined to the SDK's containers: it either
// targets the container itself or requires it as an ancestor.
const sdkDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeRequire = createRequire(import.meta.url);

const sdkStylesheets = [
    ...readFileSync(resolve(sdkDir, 'index.tsx'), 'utf-8').matchAll(
        /^import '([^']+\.css)';$/gm,
    ),
].map(([, specifier]) => ({
    specifier,
    file: specifier.startsWith('.')
        ? resolve(sdkDir, specifier)
        : nodeRequire.resolve(specifier),
}));

const listSelectors = (css: string) => {
    const selectors: string[] = [];
    postcss.parse(css).walkRules((rule) => {
        const parent = rule.parent;
        const inKeyframes =
            parent?.type === 'atrule' &&
            /keyframes$/i.test((parent as postcss.AtRule).name);
        if (!inKeyframes) {
            selectors.push(...rule.selectors);
        }
    });
    return selectors;
};

const scope = `\\.${SDK_SCOPE_CLASS}`;
const confinedToSdk = new RegExp(
    `^(${scope}(\\b|\\[)|:where\\(${scope}|:host\\(${scope})`,
);

describe('SDK stylesheets', () => {
    it.each(sdkStylesheets.map(({ specifier, file }) => [specifier, file]))(
        '%s cannot style the host page once scoped',
        (_specifier, file) => {
            const scoped = postcss([scopeDocumentRules]).process(
                readFileSync(file, 'utf-8'),
                { from: file },
            ).css;
            const escaping = listSelectors(scoped).filter(
                (selector) => !confinedToSdk.test(selector),
            );
            expect(escaping).toEqual([]);
        },
    );
});
