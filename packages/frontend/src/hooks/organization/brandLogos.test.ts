import { type OrganizationBrandLogo } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { findSquareBrandLogo, pickBrandLogo } from './brandLogos';

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

    it('imports the best-ranked square logo and skips wide ones', async () => {
        const wide = { ...main, type: 'logo', url: '/wide.png' };
        const icon = { ...main, type: 'icon', url: '/icon.png' };
        const sizes: Record<string, { width: number; height: number }> = {
            '/wide.png': { width: 200, height: 50 },
            '/icon.png': { width: 64, height: 64 },
        };
        await expect(
            findSquareBrandLogo([wide, icon], async (url) => sizes[url]),
        ).resolves.toEqual(icon);
    });

    it('imports no logo when none is square or loadable', async () => {
        await expect(
            findSquareBrandLogo([main], async () => ({
                width: 200,
                height: 50,
            })),
        ).resolves.toBeNull();
        await expect(
            findSquareBrandLogo([main], async () => {
                throw new Error('not reachable');
            }),
        ).resolves.toBeNull();
    });
});
