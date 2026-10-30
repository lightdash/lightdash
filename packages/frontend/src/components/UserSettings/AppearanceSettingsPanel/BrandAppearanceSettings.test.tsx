import { type OrganizationBrand } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    findSquareBrandLogo,
    loadImageSize,
} from '../../../hooks/organization/brandLogos';
import { BrandAppearanceSettings } from './BrandAppearanceSettings';

const state = vi.hoisted(() => ({
    licenseValid: true,
    hasBrandfetch: true,
    fetchBrand: vi.fn(),
}));
vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: {
            license: { valid: state.licenseValid, hasLicenseKey: true },
            hasBrandfetch: state.hasBrandfetch,
        },
    }),
}));
vi.mock('../../../hooks/organization/useOrganizationBrand', () => ({
    useOrganizationBrand: () => ({
        data: null,
        isInitialLoading: false,
        isError: false,
        refetch: vi.fn(),
    }),
    useFetchOrganizationBrand: () => ({
        mutate: state.fetchBrand,
        isLoading: false,
    }),
    useSaveOrganizationBrand: () => ({ mutate: vi.fn(), isLoading: false }),
    useUploadOrganizationBrandLogo: () => ({
        mutate: vi.fn(),
        reset: vi.fn(),
        isLoading: false,
        isError: false,
    }),
}));
vi.mock('../../../hooks/appearance/useOrganizationAppearance', () => ({
    useColorPalettes: () => ({ data: [] }),
    useCreateColorPalette: () => ({ mutate: vi.fn(), isLoading: false }),
}));
vi.mock('../../../hooks/organization/brandLogos', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    findSquareBrandLogo: vi.fn(),
    loadImageSize: vi.fn(),
}));

const wideLogo = { type: 'logo', theme: null, url: '/wide.png', format: 'png' };
const iconLogo = { type: 'icon', theme: null, url: '/icon.png', format: 'png' };
const fetched: OrganizationBrand = {
    organizationUuid: 'org',
    domain: 'acme.com',
    name: 'Acme',
    description: null,
    logos: [wideLogo, iconLogo],
    colors: [{ hex: '#123456', type: 'brand', brightness: null }],
    fonts: [],
    updatedAt: new Date(),
};

const renderSettings = () =>
    render(
        <MantineProvider env="test">
            <BrandAppearanceSettings canManageColorPalette />
        </MantineProvider>,
    );
const importBrand = () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Website' }), {
        target: { value: 'acme.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import brand/ }));
};

beforeEach(() => {
    vi.clearAllMocks();
    state.licenseValid = true;
    state.hasBrandfetch = true;
    state.fetchBrand.mockImplementation((_variables, options) =>
        options.onSuccess(fetched),
    );
    vi.mocked(loadImageSize).mockResolvedValue({ width: 64, height: 64 });
});
afterEach(cleanup);

describe('brand appearance import', () => {
    it('applies the colors and only a square logo', async () => {
        vi.mocked(findSquareBrandLogo).mockResolvedValue(iconLogo);
        renderSettings();
        importBrand();
        expect(await screen.findByAltText('Brand logo')).toHaveAttribute(
            'src',
            '/icon.png',
        );
        expect(findSquareBrandLogo).toHaveBeenCalledWith(fetched.logos);
        expect(screen.getByLabelText('Brand color 1')).toHaveValue('#123456');
        expect(
            screen.queryByText(/No square logo was found/),
        ).not.toBeInTheDocument();
    });

    it('keeps the logo empty and says so when no square logo exists', async () => {
        vi.mocked(findSquareBrandLogo).mockResolvedValue(null);
        renderSettings();
        importBrand();
        expect(
            await screen.findByText(/No square logo was found/),
        ).toBeInTheDocument();
        expect(screen.queryByAltText('Brand logo')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Brand color 1')).toHaveValue('#123456');
    });

    it('offers only the color import without a valid license', () => {
        state.licenseValid = false;
        renderSettings();
        expect(screen.queryByText('Brand identity')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Import brand colors' }),
        ).toBeInTheDocument();
        importBrand();
        expect(screen.getByLabelText('Brand color 1')).toHaveValue('#123456');
        expect(findSquareBrandLogo).not.toHaveBeenCalled();
    });

    it('renders nothing without a license, Brandfetch or a saved brand', () => {
        state.licenseValid = false;
        state.hasBrandfetch = false;
        renderSettings();
        expect(
            screen.queryByRole('textbox', { name: 'Website' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add color' }),
        ).not.toBeInTheDocument();
    });
});
