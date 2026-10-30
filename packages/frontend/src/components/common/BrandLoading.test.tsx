import { type OrganizationBrand } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavBarLogo } from '../NavBar/NavBarLogo';
import { BrandedFaviconSync } from './BrandedFaviconSync';
import { BrandedAppNameSync, DocumentTitle } from './DocumentTitle';

const state = vi.hoisted(() => ({
    health: undefined as
        | {
              license?: { valid: boolean; hasLicenseKey: boolean };
              isAuthenticated: boolean;
          }
        | undefined,
    user: undefined as { organizationUuid: string } | undefined,
    brand: undefined as OrganizationBrand | null | undefined,
    embedded: false,
    colorScheme: 'light' as 'light' | 'dark',
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: state.health },
        user: { data: state.user },
    }),
}));
vi.mock('../../hooks/organization/useOrganizationBrand', () => ({
    useOrganizationBrand: () => ({ data: state.brand }),
}));
vi.mock('../../ee/providers/Embed/useIsEmbedded', () => ({
    default: () => state.embedded,
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ mode: state.embedded ? 'sdk' : 'direct' }),
}));

const brand: OrganizationBrand = {
    organizationUuid: 'org',
    domain: 'acme.com',
    name: 'Acme',
    description: null,
    logos: [{ url: '/logo.png', format: 'png', theme: 'light', type: 'icon' }],
    colors: [],
    fonts: [],
    updatedAt: new Date(),
};
const AppBrand = () => (
    <MantineProvider env="test" forceColorScheme={state.colorScheme}>
        <BrandedAppNameSync />
        <BrandedFaviconSync />
        <DocumentTitle title="Settings" />
        <NavBarLogo />
    </MantineProvider>
);
let favicon: HTMLLinkElement;
beforeEach(() => {
    state.health = undefined;
    state.user = undefined;
    state.brand = undefined;
    state.embedded = false;
    state.colorScheme = 'light';
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.href = '/favicon-neutral.svg';
    favicon.dataset.defaultHref = '/favicon.ico';
    document.head.append(favicon);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:brand-logo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    favicon.remove();
    vi.restoreAllMocks();
});

describe('brand loading', () => {
    it('stays neutral through health, user and brand loading, then applies the brand', async () => {
        let resolveLogo: (response: Response) => void = () => {};
        vi.spyOn(globalThis, 'fetch').mockReturnValue(
            new Promise((resolve) => {
                resolveLogo = resolve;
            }),
        );
        const { container, rerender } = render(<AppBrand />);
        const expectNeutral = () => {
            expect(container.querySelector('img')).toHaveAttribute(
                'src',
                '/favicon-neutral.svg',
            );
            expect(document.title).not.toContain('Lightdash');
            expect(favicon).toHaveAttribute('href', '/favicon-neutral.svg');
        };
        expectNeutral();
        state.health = {
            license: { valid: true, hasLicenseKey: true },
            isAuthenticated: true,
        };
        rerender(<AppBrand />);
        expectNeutral();
        state.user = { organizationUuid: 'org' };
        rerender(<AppBrand />);
        expectNeutral();
        state.brand = brand;
        rerender(<AppBrand />);
        expect(screen.getByAltText('Acme logo')).toHaveAttribute(
            'src',
            '/logo.png',
        );
        expect(document.title).toContain('Settings - Acme');
        expect(favicon).toHaveAttribute('href', '/favicon-neutral.svg');
        await act(async () => {
            resolveLogo(new Response(new Blob(['logo'])));
        });
        expect(favicon).toHaveAttribute('href', 'blob:brand-logo');
        rerender(<AppBrand />);
        expect(favicon).toHaveAttribute('href', 'blob:brand-logo');
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('only uses defaults after confirming there is no saved brand', () => {
        state.health = {
            license: { valid: true, hasLicenseKey: true },
            isAuthenticated: true,
        };
        state.user = { organizationUuid: 'org' };
        const { container, rerender } = render(<AppBrand />);
        expect(document.title).not.toContain('Lightdash');
        state.brand = null;
        rerender(<AppBrand />);
        expect(document.title).toContain('Lightdash');
        expect(container.querySelector('svg')).not.toBeNull();
        expect(favicon).toHaveAttribute('href', '/favicon.ico');
    });

    it.each([
        undefined,
        { valid: false, hasLicenseKey: false },
        { valid: false, hasLicenseKey: true },
    ])(
        'uses defaults when the license is missing or invalid (%j)',
        (license) => {
            state.health = {
                license,
                isAuthenticated: true,
            };
            state.user = { organizationUuid: 'org' };
            state.brand = brand;
            render(<AppBrand />);
            expect(document.title).toContain('Lightdash');
            expect(favicon).toHaveAttribute('href', '/favicon.ico');
        },
    );

    it('keeps a failed custom logo neutral', () => {
        state.health = {
            license: { valid: true, hasLicenseKey: true },
            isAuthenticated: true,
        };
        state.user = { organizationUuid: 'org' };
        state.brand = brand;
        const { container } = render(
            <MantineProvider env="test" forceColorScheme={state.colorScheme}>
                <NavBarLogo />
            </MantineProvider>,
        );
        fireEvent.error(screen.getByAltText('Acme logo'));
        expect(container.querySelector('img')).toHaveAttribute(
            'src',
            '/favicon-neutral.svg',
        );
        expect(container.querySelector('svg')).toBeNull();
    });

    it('keeps the same navigation logo and favicon in both color schemes', async () => {
        state.health = {
            license: { valid: true, hasLicenseKey: true },
            isAuthenticated: true,
        };
        state.user = { organizationUuid: 'org' };
        state.brand = {
            ...brand,
            logos: [
                { ...brand.logos[0], theme: null },
                { ...brand.logos[0], url: '/dark-logo.png', theme: 'light' },
            ],
        };
        const fetchLogo = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(async () => new Response(new Blob(['logo'])));
        const { rerender } = render(<AppBrand />);
        expect(screen.getByAltText('Acme logo')).toHaveAttribute(
            'src',
            '/logo.png',
        );
        await act(async () => {});
        expect(fetchLogo).toHaveBeenLastCalledWith('/logo.png', {
            credentials: 'same-origin',
        });
        state.colorScheme = 'dark';
        rerender(<AppBrand />);
        expect(screen.getByAltText('Acme logo')).toHaveAttribute(
            'src',
            '/logo.png',
        );
        await act(async () => {});
        expect(fetchLogo).toHaveBeenLastCalledWith('/logo.png', {
            credentials: 'same-origin',
        });
        expect(fetchLogo).toHaveBeenCalledOnce();
        state.colorScheme = 'light';
        rerender(<AppBrand />);
        expect(screen.getByAltText('Acme logo')).toHaveAttribute(
            'src',
            '/logo.png',
        );
        await act(async () => {});
    });

    it('leaves the SDK host title and favicon untouched', () => {
        state.embedded = true;
        document.title = 'Host app';
        favicon.href = '/host-icon.svg';
        render(<AppBrand />);
        expect(document.title).toBe('Host app');
        expect(favicon).toHaveAttribute('href', '/host-icon.svg');
    });
});
