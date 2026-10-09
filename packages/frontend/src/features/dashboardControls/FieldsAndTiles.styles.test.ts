import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
    join(__dirname, 'FieldsAndTiles.module.css'),
    'utf8',
);

describe('FieldsAndTiles styles', () => {
    it('keeps the keyboard focus ring on a selected row', () => {
        // The ring is Mantine's, on :focus-visible: a selected row may only
        // drop the outline it gets without it
        expect(stylesheet).not.toMatch(
            /\.rowMain\[data-highlighted\]\s*\{[^}]*outline:\s*none/,
        );
        expect(stylesheet).toMatch(
            /\.rowMain\[data-highlighted\]:not\(:focus-visible\)\s*\{[^}]*outline:\s*none/,
        );
    });
});
