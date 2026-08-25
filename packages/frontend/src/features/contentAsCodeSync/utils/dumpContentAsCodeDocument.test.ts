import { describe, expect, it } from 'vitest';
import { dumpContentAsCodeDocument } from './dumpContentAsCodeDocument';

describe('dumpContentAsCodeDocument', () => {
    it('returns an empty string for a missing document', () => {
        expect(dumpContentAsCodeDocument(null)).toBe('');
    });

    it('dumps a stable YAML document', () => {
        expect(
            dumpContentAsCodeDocument({
                name: 'orders',
                slug: 'orders-over-time',
            }),
        ).toBe('name: orders\nslug: orders-over-time\n');
    });
});
