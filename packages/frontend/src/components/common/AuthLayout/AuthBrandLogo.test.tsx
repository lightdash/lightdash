import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthBrandLogo from './AuthBrandLogo';

const brand = vi.hoisted(() => ({
    logoUrl: null as string | null,
    name: null as string | null,
    isResolved: true,
    isInstanceBrandResolved: true,
}));
vi.mock('../../../hooks/organization/useWhiteLabelBrand', () => ({
    useWhiteLabelBrand: () => brand,
}));

const renderLogo = () =>
    render(
        <MantineProvider env="test">
            <AuthBrandLogo fallback={<span>Lightdash</span>} />
        </MantineProvider>,
    );

beforeEach(() => {
    brand.logoUrl = 'https://cdn.example.com/logo.png';
    brand.name = 'Acme Analytics';
    brand.isResolved = true;
    brand.isInstanceBrandResolved = true;
});

describe('AuthBrandLogo', () => {
    it('shows the Lightdash fallback without a brand', () => {
        brand.logoUrl = null;
        brand.name = null;
        renderLogo();
        expect(screen.getByText('Lightdash')).toBeInTheDocument();
    });

    it('does not wait for the organization brand', () => {
        brand.isResolved = false;
        renderLogo();
        expect(screen.getByAltText('Acme Analytics logo')).toBeInTheDocument();
    });

    it('keeps the name when the logo fails to load', () => {
        renderLogo();
        fireEvent.error(screen.getByAltText('Acme Analytics logo'));
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByText('Acme Analytics')).toBeInTheDocument();
        expect(screen.queryByText('Lightdash')).toBeNull();
    });

    it('renders nothing when the only branding is a broken logo', () => {
        brand.name = null;
        const { container } = renderLogo();
        fireEvent.error(screen.getByAltText('logo'));
        expect(container.querySelector('img')).toBeNull();
        expect(screen.queryByText('Lightdash')).toBeNull();
    });
});
