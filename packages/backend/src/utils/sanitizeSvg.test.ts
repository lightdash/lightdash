import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './sanitizeSvg';

describe('sanitizeSvg', () => {
    it('preserves SVG shapes and filters', () => {
        const result = sanitizeSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><defs><filter id="blur"><feGaussianBlur stdDeviation="2"/></filter></defs><circle cx="10" cy="10" r="5" filter="url(#blur)"/></svg>',
        );
        expect(result).toContain('<circle');
        expect(result).toContain('filter="url(#blur)"');
        expect(result).toContain('<feGaussianBlur');
    });

    it('removes executable content while retaining safe shapes', () => {
        const result = sanitizeSvg(
            '<svg onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><circle r="5" onclick="alert(1)"/></a><foreignObject><iframe src="https://example.com"/></foreignObject></svg>',
        );
        expect(result).toContain('<circle');
        expect(result).not.toMatch(
            /script|onload|onclick|foreignObject|iframe/,
        );
    });
});
