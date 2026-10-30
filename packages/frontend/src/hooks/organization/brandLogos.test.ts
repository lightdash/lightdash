import { type OrganizationBrandLogo } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { pickBrandLogo } from './brandLogos';

const main: OrganizationBrandLogo = {
    url: '/main.png',
    theme: null,
    type: 'logo',
    format: 'png',
};

describe('brand logo selection', () => {
    it.each([null, 'dark', 'light'])(
        'supports existing logos with theme %s',
        (theme) => {
            const logo = { ...main, theme };
            expect(pickBrandLogo([logo])).toEqual(logo);
        },
    );

    it('keeps the primary image when a previous dark mode override exists', () => {
        expect(
            pickBrandLogo([
                main,
                { ...main, url: '/dark.png', theme: 'light', type: 'icon' },
            ]),
        ).toEqual(main);
    });

    it('prefers icons and SVG formats when importing multiple candidates', () => {
        const icon = { ...main, type: 'icon', format: 'svg', url: '/icon.svg' };
        expect(pickBrandLogo([main, { ...main, type: 'icon' }, icon])).toEqual(
            icon,
        );
    });

    it('returns no logo for an empty list', () => {
        expect(pickBrandLogo([])).toBeNull();
    });
});
