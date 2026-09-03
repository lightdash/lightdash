import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMBED_CLASS_CONTRACT, embedContractClass } from './embedClassContract';

// Every `embedContractClass(...)` call site lives in the embed wrappers or
// the SDK entry (which owns the `ld-sdk-*` containers).
const testDir = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(testDir, '../EmbedDashboard/components');
const sdkEntry = join(testDir, '../../../../../sdk/index.tsx');
const componentSource = [
    ...readdirSync(componentsDir)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => join(componentsDir, file)),
    sdkEntry,
]
    .map((file) => readFileSync(file, 'utf-8'))
    .join('\n');

describe('embed class contract', () => {
    // Frozen public vocabulary: renaming/removing a class breaks customer CSS.
    it('exposes exactly the published classnames', () => {
        expect([...EMBED_CLASS_CONTRACT]).toEqual([
            'ld-dashboard-header',
            'ld-dashboard-filters',
            'ld-dashboard-filter',
            'ld-dashboard-add-filter',
            'ld-dashboard-date-zoom',
            'ld-dashboard-parameters',
            'ld-dashboard-parameter',
            'ld-dashboard-filter-dropdown',
            'ld-dashboard-add-filter-dropdown',
            'ld-dashboard-date-zoom-dropdown',
            'ld-dashboard-parameter-dropdown',
            'ld-dashboard-guided-setup',
            'ld-dashboard-export-all',
            'ld-sdk-root',
            'ld-sdk-portal',
        ]);
    });

    // Every registered class must actually be applied to an element.
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
