import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMBED_CLASS_CONTRACT, embedContractClass } from './embedClassContract';

// Raw source of the embed wrappers that apply the contract classes. Every
// `embedContractClass(...)` call site lives in this directory, so scanning it
// tells us which classes are actually wired onto an element.
const componentsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../EmbedDashboard/components',
);
const componentSource = readdirSync(componentsDir)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => readFileSync(join(componentsDir, file), 'utf-8'))
    .join('\n');

describe('embed class contract', () => {
    // The public class vocabulary is FROZEN: renaming or removing an entry
    // breaks embedding customers' stylesheets. Change this list only with a
    // deliberate deprecation — never to make a failing test pass.
    it('exposes exactly the published classnames', () => {
        expect([...EMBED_CLASS_CONTRACT]).toEqual([
            'ld-dashboard-header',
            'ld-dashboard-filters',
            'ld-dashboard-filter',
            'ld-dashboard-date-zoom',
            'ld-dashboard-parameters',
            'ld-dashboard-parameter',
            'ld-dashboard-filter-dropdown',
            'ld-dashboard-date-zoom-dropdown',
            'ld-dashboard-parameter-dropdown',
        ]);
    });

    // A registered class that is never applied is a hook customers are told
    // exists but that never renders. Guard against adding to the registry
    // without wiring it onto a component.
    it.each([...EMBED_CLASS_CONTRACT])(
        'applies "%s" in an embed component',
        (className) => {
            expect(componentSource).toContain(`'${className}'`);
        },
    );

    describe('embedContractClass', () => {
        it('joins the public class with module classes', () => {
            expect(
                embedContractClass('ld-dashboard-header', 'mod_abc123'),
            ).toBe('ld-dashboard-header mod_abc123');
        });

        it('drops falsy module classes', () => {
            expect(
                embedContractClass(
                    'ld-dashboard-filters',
                    false,
                    undefined,
                    null,
                ),
            ).toBe('ld-dashboard-filters');
        });
    });
});
