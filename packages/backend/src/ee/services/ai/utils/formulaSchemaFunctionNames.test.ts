import { FORMULA_SCHEMA_FUNCTION_NAMES } from '@lightdash/common';
import { FUNCTION_DEFINITIONS } from '@lightdash/formula';
import { describe, expect, it } from 'vitest';

// The formula schema description in common lists function names as prose, but
// common cannot depend on the private @lightdash/formula package. This guards
// that list against drifting from the real catalog.
describe('formula schema function names', () => {
    it('only names functions that exist in the formula catalog', () => {
        const catalog = new Set(FUNCTION_DEFINITIONS.map((f) => f.name));
        const listed = Object.values(FORMULA_SCHEMA_FUNCTION_NAMES).flat();

        const missing = listed.filter((name) => !catalog.has(name));
        expect(missing).toEqual([]);
    });
});
