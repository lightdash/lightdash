import { describe, expect, it } from 'vitest';
import { applyProposal, fileBefore, proposedPathOf } from './proposedFile';

const file = [
    'models:',
    '  - name: orders',
    '    columns:',
    '      - name: status',
    '        description: Order status',
    '      - name: amount',
    '        description: Total',
].join('\n');

// Line numbers are off on purpose: agents get them wrong.
const patch = `--- a/models/orders.yml
+++ b/models/orders.yml
@@ -40,3 +40,3 @@
       - name: status
-        description: Order status
+        description: Where the order is, from placed to returned
       - name: amount
@@ -1,2 +1,2 @@
-        description: Total
+        description: Total paid, in dollars
`;

describe('applyProposal', () => {
    it('applies each hunk where its lines are, not where it says', () => {
        expect(proposedPathOf(patch)).toBe('models/orders.yml');
        expect(applyProposal([patch], 'models/orders.yml', file)).toBe(
            file
                .replace(
                    'Order status',
                    'Where the order is, from placed to returned',
                )
                .replace('Total', 'Total paid, in dollars'),
        );
    });

    it('gives nothing for another file or once the change is in', () => {
        expect(applyProposal([patch], 'models/customers.yml', file)).toBe(null);
        const applied = applyProposal([patch], 'models/orders.yml', file);
        expect(applyProposal([patch], 'models/orders.yml', applied ?? '')).toBe(
            null,
        );
    });
});

describe('fileBefore', () => {
    it('undoes a change to read the file as it was', () => {
        const patch = [
            'diff --git a/models/orders.yml b/models/orders.yml',
            '--- a/models/orders.yml',
            '+++ b/models/orders.yml',
            '@@ -1,3 +1,3 @@',
            ' models:',
            '-  - name: old',
            '+  - name: new',
            '     columns:',
        ].join('\n');
        expect(
            fileBefore(
                patch,
                'models/orders.yml',
                'models:\n  - name: new\n    columns:\n',
            ),
        ).toBe('models:\n  - name: old\n    columns:\n');
    });
});
